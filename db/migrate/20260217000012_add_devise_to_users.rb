class AddDeviseToUsers < ActiveRecord::Migration[8.0]
  def change
    # Rename password_hash to encrypted_password (Devise convention)
    rename_column :users, :password_hash, :encrypted_password

    # Add jti column for JWT revocation
    add_column :users, :jti, :string
    add_index :users, :jti, unique: true

    # Backfill jti for existing users
    reversible do |dir|
      dir.up do
        execute 'UPDATE users SET jti = gen_random_uuid() WHERE jti IS NULL'
        change_column_null :users, :jti, false
      end
    end
  end
end
