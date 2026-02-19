module API
  class WebhooksController < ApplicationController
    def pagerduty
      webhook = IntegrationWebhook.find_by!(token: params[:token], integration: 'pagerduty')
      account = webhook.account

      events = extract_pagerduty_events(params)
      triggered = events.select { |e| e[:event_type] == 'incident.triggered' }

      return head :ok if triggered.empty?

      triggered.each do |event|
        incident = event[:incident]
        next unless incident

        conversation = create_conversation(account, incident)
        prompt = build_investigation_prompt(incident)

        conversation.add_message(
          role: 'user',
          content: prompt
        )

        enqueue_agent_run(conversation, account.id, prompt)

        broadcast_conversation_created(conversation, account.id)
      end

      head :accepted
    rescue ActiveRecord::RecordNotFound
      head :not_found
    end

    private

    def extract_pagerduty_events(payload)
      # PagerDuty V3 webhook format: { event: { event_type, data } }
      # PagerDuty may also send arrays of events
      if payload[:event].present?
        incident_data = payload[:event][:data] || {}
        [{ event_type: payload[:event][:event_type], incident: incident_data }]
      elsif payload[:messages].present?
        # Legacy V2 format
        payload[:messages].map do |msg|
          {
            event_type: msg[:event],
            incident: msg.dig(:incident) || msg.dig(:data, :incident)
          }
        end
      else
        []
      end
    end

    def create_conversation(account, incident)
      account.conversations.create!(
        title: "[PagerDuty] #{incident[:title] || incident[:summary] || 'Incident'}"
      )
    end

    def build_investigation_prompt(incident)
      title = incident[:title] || incident[:summary] || 'Unknown incident'
      urgency = incident[:urgency] || 'unknown'
      service_name = incident.dig(:service, :summary) || incident.dig(:service, :name) || 'unknown'
      html_url = incident[:html_url] || incident[:self]
      description = incident[:description] || incident.dig(:body, :details)

      parts = []
      parts << "A PagerDuty incident has been triggered and requires investigation."
      parts << ""
      parts << "**Incident:** #{title}"
      parts << "**Urgency:** #{urgency}"
      parts << "**Service:** #{service_name}"
      parts << "**PagerDuty URL:** #{html_url}" if html_url
      parts << ""
      if description.present?
        parts << "**Description:**"
        parts << description
        parts << ""
      end
      parts << "Please investigate this incident using the available integrations. Check for related errors, metrics anomalies, recent deployments, and infrastructure issues. Provide a root cause analysis and recommended next steps."

      parts.join("\n")
    end

    def enqueue_agent_run(conversation, account_id, prompt)
      AgentRunJob.perform_async(
        conversation.id,
        account_id,
        prompt,
        nil, # model — use default
        conversation.messages.for_agent.ordered.map(&:as_api_json).to_json,
        { persisted_context: nil, has_title: true }.to_json
      )

      Rails.cache.write("active_job:#{conversation.id}", true, expires_in: 10.minutes)
    end

    def broadcast_conversation_created(conversation, account_id)
      ActionCable.server.broadcast(
        "account:#{account_id}",
        {
          type: 'conversation:created',
          id: conversation.id,
          title: conversation.title,
          created_at: conversation.created_at,
          updated_at: conversation.updated_at,
          message_count: 1
        }
      )
    end
  end
end
