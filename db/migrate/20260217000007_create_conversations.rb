class CreateConversations < ActiveRecord::Migration[8.0]
  def change
    create_table :conversations, id: :uuid do |t|
      t.uuid :account_id, null: false
      t.uuid :created_by_user_id
      t.uuid :resource_map_id
      t.string :title
      t.jsonb :messages, null: false, default: []
      t.jsonb :investigation_context

      t.timestamps
    end

    add_index :conversations, :account_id
    add_index :conversations, :created_at
  end
end
