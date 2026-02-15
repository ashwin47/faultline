class CreateSettings < ActiveRecord::Migration[8.0]
  def change
    create_table :settings do |t|
      t.uuid :account_id, null: false
      t.string :key, null: false
      t.text :value, null: false
      t.boolean :is_encrypted, default: false, null: false

      t.timestamps
    end

    add_index :settings, :account_id
    add_index :settings, %i[account_id key], unique: true
  end
end
