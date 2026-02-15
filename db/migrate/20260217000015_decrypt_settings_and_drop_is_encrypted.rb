class DecryptSettingsAndDropIsEncrypted < ActiveRecord::Migration[8.1]
  def up
    # Decrypt any values that were encrypted with the old custom MessageEncryptor.
    # After this migration Rails' encrypts :value handles encryption transparently.
    encryption_key = AppConfig.encryption_key
    encryptor = ActiveSupport::MessageEncryptor.new(encryption_key)

    execute('SELECT id, value FROM settings WHERE is_encrypted = true').each do |row|
      plaintext = encryptor.decrypt_and_verify(row['value'])
      execute(
        "UPDATE settings SET value = #{connection.quote(plaintext)} WHERE id = #{connection.quote(row['id'])}"
      )
    rescue ActiveSupport::MessageEncryptor::InvalidMessage
      Rails.logger.warn("Setting #{row['id']} could not be decrypted — skipping")
    end

    remove_column :settings, :is_encrypted
  end

  def down
    add_column :settings, :is_encrypted, :boolean, default: false, null: false
  end
end
