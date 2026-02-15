class CreateMessages < ActiveRecord::Migration[8.1]
  def change
    create_table :messages, id: :uuid do |t|
      t.uuid :conversation_id, null: false
      t.string :role, null: false
      t.text :content, null: false, default: ''
      t.jsonb :tool_uses
      t.jsonb :reasoning
      t.integer :position, null: false
      t.timestamps
    end

    add_index :messages, %i[conversation_id position]
  end
end
