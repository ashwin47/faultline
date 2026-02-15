class CreateSystemKvs < ActiveRecord::Migration[8.0]
  def change
    create_table :system_kvs, id: false do |t|
      t.string :key, primary_key: true
      t.string :value, null: false
    end
  end
end
