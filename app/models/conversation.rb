class Conversation < ApplicationRecord
  belongs_to :account
  has_many :messages, dependent: :destroy
  has_many :tool_executions, dependent: :destroy

  scope :recent, -> { order(updated_at: :desc) }

  def add_message(msg)
    attrs = msg.is_a?(Hash) ? msg.with_indifferent_access : msg
    params = {
      id: attrs[:id] || SecureRandom.uuid,
      role: attrs[:role],
      content: attrs[:content],
      message_type: attrs[:message_type] || attrs[:messageType] || 'text',
      tool_uses: attrs[:toolUses] || attrs[:tool_uses],
      reasoning: attrs[:reasoning],
      user_id: attrs[:user_id] || attrs[:userId],
      position: messages.count
    }
    params[:mentions] = attrs[:mentions] if attrs[:mentions].present?
    messages.create!(params)
  end

  def log_tool_execution(attrs)
    tool_executions.create!(
      tool_name: attrs[:tool_name],
      input_params: attrs[:input_params] || {},
      output_result: attrs[:output_result],
      execution_time_ms: attrs[:execution_time_ms],
      status: attrs[:status],
      error_message: attrs[:error_message],
      executed_at: attrs[:executed_at] || Time.current
    )
  end
end
