class CreateSessions < ActiveRecord::Migration[8.0]
  def change
    create_table :sessions, id: :uuid do |t|
      t.uuid :user_id, null: false
      t.string :ip_address
      t.string :user_agent
      t.datetime :last_active_at

      t.timestamps
    end

    add_index :sessions, :user_id
  end
end
