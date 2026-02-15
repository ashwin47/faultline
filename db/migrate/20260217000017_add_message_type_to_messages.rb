class AddMessageTypeToMessages < ActiveRecord::Migration[8.1]
  def change
    add_column :messages, :message_type, :string, null: false, default: 'text'
    change_column_null :messages, :content, true
    change_column_default :messages, :content, nil
  end
end
