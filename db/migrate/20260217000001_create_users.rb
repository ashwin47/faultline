class CreateUsers < ActiveRecord::Migration[8.0]
  def change
    create_table :users, id: :uuid do |t|
      t.string :email, null: false
      t.string :password_hash, null: false
      t.string :name, null: false
      t.boolean :email_verified, default: false, null: false
      t.string :email_verification_token
      t.datetime :email_verification_expires_at
      t.uuid :last_active_account_id

      t.timestamps
    end

    add_index :users, :email, unique: true
    add_index :users, :email_verification_token, unique: true
  end
end
