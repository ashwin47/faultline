class CreateToolExecutions < ActiveRecord::Migration[8.0]
  def change
    create_table :tool_executions do |t|
      t.uuid :conversation_id
      t.string :tool_name, null: false
      t.jsonb :input_params, null: false, default: {}
      t.jsonb :output_result
      t.integer :execution_time_ms
      t.string :status, null: false
      t.text :error_message
      t.datetime :executed_at

      t.timestamps
    end

    add_index :tool_executions, :conversation_id
    add_index :tool_executions, :tool_name
  end
end
