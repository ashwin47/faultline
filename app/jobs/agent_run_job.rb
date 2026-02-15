class AgentRunJob
  include Sidekiq::Job

  sidekiq_options queue: :agent_runs, retry: 0

  def perform(conversation_id, account_id, user_message, model, messages_json, options_json)
    options = JSON.parse(options_json, symbolize_names: true)
    persisted_context = options[:persisted_context]
    has_title = options[:has_title]

    # Load settings (API keys for Python to use)
    settings = Setting.where(account_id: account_id).visible.to_h { |s| [s.key, s.value] }

    # Load resource maps with groups
    resource_maps = ResourceMap.where(account_id: account_id).with_groups
                               .includes(:resource_groups)
                               .map { |rm| rm_as_agent_json(rm) }

    # HTTP POST to Python agent service with SSE streaming
    url = "#{agent_service_url}/api/agent/run"
    payload = {
      conversation_id: conversation_id,
      account_id: account_id,
      user_message: user_message,
      model: model,
      messages: JSON.parse(messages_json),
      settings: settings,
      resource_maps: resource_maps,
      persisted_context: persisted_context,
      has_title: has_title
    }

    # Subscribe to cancel signals
    cancelled = Concurrent::AtomicBoolean.new(false)
    cancel_thread = Thread.new do
      redis = Redis.new(url: redis_url)
      redis.subscribe("agent:cancel:#{conversation_id}") do |on|
        on.message do |_channel, _msg|
          cancelled.make_true
          redis.unsubscribe
        end
      end
    rescue Redis::BaseConnectionError
      # Connection closed, that's fine
    end

    begin
      stream_sse(url, payload) do |event|
        break if cancelled.true?

        handle_event(conversation_id, account_id, event)
      end
    ensure
      cancel_thread.kill if cancel_thread.alive?
      Rails.cache.delete("active_job:#{conversation_id}")

      # Always broadcast that the agent is done — this is the safety net.
      # The frontend may have already transitioned via message:created,
      # but if the SSE stream broke or the message failed to save, this
      # ensures the client doesn't stay stuck in "Investigating..." forever.
      ActionCable.server.broadcast("conversation:#{conversation_id}", { type: 'agent:stopped' })
    end
  end

  private

  def rm_as_agent_json(rm)
    {
      id: rm.id,
      name: rm.name,
      description: rm.description,
      nodes: rm.nodes,
      edges: rm.edges,
      groups: rm.resource_groups.map { |g| { id: g.id, name: g.name, node_ids: g.node_ids } }
    }
  end

  def agent_service_url
    AppConfig.agent_service_url
  end

  def redis_url
    AppConfig.redis_url
  end

  def stream_sse(url, payload)
    uri = URI.parse(url)

    conn = Faraday.new(url: "#{uri.scheme}://#{uri.host}:#{uri.port}") do |f|
      f.options.timeout = 300 # 5 minute timeout for long-running agent calls
      f.options.open_timeout = 10
      f.adapter :net_http
    end

    buffer = +''

    conn.post(uri.path) do |req|
      req.headers['Content-Type'] = 'application/json'
      req.headers['Accept'] = 'text/event-stream'
      req.body = payload.to_json

      req.options.on_data = proc do |chunk, _overall_received_bytes, _env|
        buffer << chunk

        # Parse SSE events: data: {...}\n\n
        while (idx = buffer.index("\n\n"))
          raw = buffer.slice!(0, idx + 2)

          raw.each_line do |line|
            line = line.strip
            next unless line.start_with?('data: ')

            json_str = line[6..]
            begin
              event = JSON.parse(json_str, symbolize_names: true)
              yield event
            rescue JSON::ParserError => e
              Rails.logger.warn("Failed to parse SSE event: #{e.message}")
            end
          end
        end
      end
    end
  rescue Faraday::Error, StandardError => e
    Rails.logger.error("SSE stream error: #{e.class}: #{e.message}")
    ActionCable.server.broadcast("conversation:#{payload[:conversation_id]}", {
                                   type: 'error',
                                   error: "Agent service error: #{e.message}"
                                 })
  end

  def handle_event(conversation_id, account_id, event)
    type = event[:type]&.to_s

    case type
    when 'thinking', 'iteration_start', 'text_delta',
         'sub_agent_start', 'sub_agent_complete', 'token_usage', 'error'
      ActionCable.server.broadcast("conversation:#{conversation_id}", event)

    when 'tool_use'
      tool_data = event[:toolUse] || event[:tool_use]
      if tool_data && %w[success error].include?(tool_data[:status]&.to_s)
        # Persist completed tool uses — model callback broadcasts
        Conversation.find(conversation_id).add_message(
          role: 'assistant',
          message_type: 'tool_use',
          tool_uses: tool_data
        )
      else
        # Broadcast running status for live UI only
        ActionCable.server.broadcast("conversation:#{conversation_id}", event)
      end

    when 'reasoning'
      # Persist evaluation — model callback broadcasts
      Conversation.find(conversation_id).add_message(
        role: 'assistant',
        message_type: 'evaluation',
        reasoning: { iteration: event[:iteration], evaluation: event[:evaluation] }
      )

    when 'response_complete'
      # Save only the final text message
      conversation = Conversation.find(conversation_id)
      msg = event[:message]
      if msg
        conversation.add_message(
          id: msg[:id],
          role: msg[:role],
          content: msg[:content],
          message_type: 'text'
        )
      end
      ActionCable.server.broadcast("account:#{account_id}", {
                                     type: 'conversation_updated',
                                     id: conversation_id
                                   })

    when 'context_update'
      Conversation.find(conversation_id).update!(investigation_context: event[:context])

    when 'title_generated'
      Conversation.find(conversation_id).update!(title: event[:title])
      ActionCable.server.broadcast("conversation:#{conversation_id}", event)
      ActionCable.server.broadcast("account:#{account_id}", {
                                     type: 'conversation_updated',
                                     id: conversation_id,
                                     title: event[:title]
                                   })

    end
  end
end
