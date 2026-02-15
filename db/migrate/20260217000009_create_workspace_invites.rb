class CreateWorkspaceInvites < ActiveRecord::Migration[8.0]
  def change
    create_table :workspace_invites, id: :uuid do |t|
      t.uuid :account_id, null: false
      t.string :email, null: false
      t.string :role, null: false
      t.uuid :invited_by_user_id, null: false
      t.string :token, null: false
      t.string :status, null: false, default: 'pending'
      t.datetime :expires_at, null: false

      t.timestamps
    end

    add_index :workspace_invites, :account_id
    add_index :workspace_invites, :token, unique: true
  end
end
