class Message < ApplicationRecord
  belongs_to :conversation, touch: true
  belongs_to :user, optional: true

  validates :role, presence: true, inclusion: { in: %w[user assistant] }
  validates :content, presence: true, if: -> { message_type == 'text' }
  validates :position, presence: true
  validates :message_type, presence: true, inclusion: { in: %w[text tool_use evaluation note] }

  scope :ordered, -> { order(:position) }
  scope :for_agent, -> { where.not(message_type: 'note') }

  after_create_commit :broadcast_to_conversation

  def as_api_json
    {
      id: id,
      role: role,
      message_type: message_type,
      content: content,
      created_at: created_at,
      tool_uses: tool_uses,
      reasoning: reasoning,
      user_id: user_id,
      mentions: mentions.presence
    }.compact
  end

  private

  def broadcast_to_conversation
    channel = "conversation:#{conversation_id}"

    case message_type
    when 'tool_use'
      ActionCable.server.broadcast(channel, { type: 'tool_use', toolUse: tool_uses })
    when 'evaluation'
      ActionCable.server.broadcast(channel, { type: 'reasoning', **reasoning.symbolize_keys })
    when 'text'
      ActionCable.server.broadcast(channel, { type: 'message:created', message: as_api_json })
    when 'note'
      ActionCable.server.broadcast(channel, { type: 'note:created', message: as_api_json })
    end
  end
end
