class CreateIntegrationWebhooks < ActiveRecord::Migration[8.0]
  def change
    create_table :integration_webhooks, id: :uuid, default: -> { "gen_random_uuid()" } do |t|
      t.uuid :account_id, null: false
      t.string :integration, null: false
      t.integer :integration_index, null: false, default: 0
      t.string :token, null: false

      t.timestamps
    end

    add_index :integration_webhooks, :token, unique: true
    add_index :integration_webhooks, %i[account_id integration integration_index], unique: true, name: "idx_webhooks_account_integration_index"
  end
end
