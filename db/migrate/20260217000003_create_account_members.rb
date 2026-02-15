class CreateAccountMembers < ActiveRecord::Migration[8.0]
  def change
    create_table :account_members, id: :uuid do |t|
      t.uuid :account_id, null: false
      t.uuid :user_id, null: false
      t.string :role, null: false, default: 'member'

      t.timestamps
    end

    add_index :account_members, :account_id
    add_index :account_members, :user_id
    add_index :account_members, %i[account_id user_id], unique: true
  end
end
