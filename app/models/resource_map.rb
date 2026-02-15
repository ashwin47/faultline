class ResourceMap < ApplicationRecord
  belongs_to :account
  has_many :resource_groups, dependent: :destroy

  validates :name, presence: true

  scope :with_groups, -> { joins(:resource_groups).distinct }
  scope :recent, -> { order(updated_at: :desc) }

  def save_graph!(new_nodes, new_edges, new_groups = nil)
    transaction do
      update!(nodes: new_nodes, edges: new_edges)
      sync_groups!(new_groups) unless new_groups.nil?
    end
  end

  def touch_last_synced!
    update!(last_synced_at: Time.current)
  end

  private

  def sync_groups!(incoming_groups)
    incoming_ids = incoming_groups.map { |g| g[:id] || g['id'] }.compact
    resource_groups.where.not(id: incoming_ids).destroy_all

    incoming_groups.each do |g|
      attrs = g.is_a?(Hash) ? g.with_indifferent_access : g
      group = resource_groups.find_or_initialize_by(id: attrs[:id])
      group.update!(
        name: attrs[:name],
        node_ids: attrs[:node_ids] || attrs[:nodeIds] || []
      )
    end
  end
end
