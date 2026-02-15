class CreateResourceGroups < ActiveRecord::Migration[8.1]
  def up
    create_table :resource_groups, id: :uuid do |t|
      t.uuid :resource_map_id, null: false
      t.string :name, null: false
      t.jsonb :node_ids, default: [], null: false
      t.timestamps
    end

    add_index :resource_groups, :resource_map_id

    # Migrate existing JSONB groups into the new table
    execute(<<~SQL).each do |row|
      SELECT id, groups FROM resource_maps WHERE groups IS NOT NULL AND groups != '[]'::jsonb
    SQL
      groups = JSON.parse(row['groups'])
      groups.each do |group|
        execute(<<~INSERT)
          INSERT INTO resource_groups (id, resource_map_id, name, node_ids, created_at, updated_at)
          VALUES (
            #{connection.quote(group['id'] || SecureRandom.uuid)},
            #{connection.quote(row['id'])},
            #{connection.quote(group['name'])},
            #{connection.quote(JSON.dump(group['nodeIds'] || group['node_ids'] || []))},
            NOW(), NOW()
          )
        INSERT
      end
    end

    remove_column :resource_maps, :groups
  end

  def down
    add_column :resource_maps, :groups, :jsonb

    execute(<<~SQL).each do |row|
      SELECT resource_map_id,
             json_agg(json_build_object('id', id, 'name', name, 'node_ids', node_ids)) AS groups_json
      FROM resource_groups
      GROUP BY resource_map_id
    SQL
      execute(<<~UPDATE)
        UPDATE resource_maps SET groups = '#{row['groups_json']}' WHERE id = #{connection.quote(row['resource_map_id'])}
      UPDATE
    end

    drop_table :resource_groups
  end
end
