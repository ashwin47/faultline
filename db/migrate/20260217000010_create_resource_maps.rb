class CreateResourceMaps < ActiveRecord::Migration[8.0]
  def change
    create_table :resource_maps, id: :uuid do |t|
      t.uuid :account_id, null: false
      t.string :name, null: false
      t.text :description
      t.jsonb :nodes, null: false, default: []
      t.jsonb :edges, null: false, default: []
      t.jsonb :groups
      t.datetime :last_synced_at

      t.timestamps
    end

    add_index :resource_maps, :account_id
  end
end
