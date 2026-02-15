class ConversationChannel < ApplicationCable::Channel
  def subscribed
    conversation_id = params[:conversation_id]
    reject unless conversation_id

    stream_from "conversation:#{conversation_id}"

    # Check if there's an active agent job for this conversation
    return unless active_job?(conversation_id)

    transmit({ type: 'agent:active', conversation_id: conversation_id })
  end

  def unsubscribed
    stop_all_streams
  end

  # Client sends a message to the agent
  def receive(data)
    message = data['message']
    conversation_id = data['conversation_id']
    model = data['model']
    account_id = current_account_id

    conversation = find_or_create_conversation(conversation_id, account_id)

    # Add user message to conversation
    user_message = {
      id: SecureRandom.uuid,
      role: 'user',
      content: message,
      timestamp: Time.current
    }
    conversation.add_message(user_message)

    enqueue_agent_run(conversation, account_id, message, model)
  end

  # Client adds a private note (not sent to the agent)
  def add_note(data)
    conversation_id = data['conversation_id'] || params[:conversation_id]
    return unless conversation_id

    conversation = Conversation.find(conversation_id)
    conversation.add_message(
      role: 'user',
      content: data['content'],
      message_type: 'note',
      user_id: data['user_id'],
      mentions: data['mentions']
    )
  end

  # Client requests to stop the agent
  def stop_agent(data)
    conversation_id = data['conversation_id']
    return unless conversation_id

    ActionCable.server.pubsub.broadcast("agent:cancel:#{conversation_id}", 'cancel')
    Rails.cache.delete("active_job:#{conversation_id}")

    ActionCable.server.broadcast(
      "conversation:#{conversation_id}",
      { type: 'agent:stopped', message: 'Request cancelled' }
    )
  end

  private

  def find_or_create_conversation(conversation_id, account_id)
    if conversation_id
      existing = Conversation.find_by(id: conversation_id, account_id: account_id)
      return existing if existing
    end

    conversation = Conversation.create!(
      account_id: account_id,
      created_by_user_id: current_user_id
    )

    transmit({ type: 'agent:conversation_created', conversation_id: conversation.id })
    broadcast_conversation_created(conversation, account_id)
    stream_from "conversation:#{conversation.id}"

    conversation
  end

  def broadcast_conversation_created(conversation, account_id)
    ActionCable.server.broadcast(
      "account:#{account_id}",
      {
        type: 'conversation:created',
        id: conversation.id,
        title: nil,
        created_at: conversation.created_at,
        updated_at: conversation.updated_at,
        message_count: 0
      }
    )
  end

  def enqueue_agent_run(conversation, account_id, message, model)
    AgentRunJob.perform_async(
      conversation.id,
      account_id,
      message,
      model,
      conversation.messages.for_agent.ordered.map(&:as_api_json).to_json,
      {
        persisted_context: conversation.investigation_context,
        has_title: conversation.title.present?
      }.to_json
    )

    Rails.cache.write("active_job:#{conversation.id}", true, expires_in: 10.minutes)
  end

  def active_job?(conversation_id)
    Rails.cache.read("active_job:#{conversation_id}").present?
  end
end
