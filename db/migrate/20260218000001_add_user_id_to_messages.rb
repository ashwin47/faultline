class AddUserIdToMessages < ActiveRecord::Migration[8.0]
  def change
    add_column :messages, :user_id, :uuid, null: true
    add_index :messages, :user_id
  end
end
