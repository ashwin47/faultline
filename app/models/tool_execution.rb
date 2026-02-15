class ToolExecution < ApplicationRecord
  belongs_to :conversation

  validates :tool_name, presence: true
  validates :status, presence: true, inclusion: { in: %w[success error] }
end
