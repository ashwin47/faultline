class AddMentionsToMessages < ActiveRecord::Migration[8.1]
  def change
    add_column :messages, :mentions, :jsonb, default: []
  end
end
