module API
  class ResourceMapsController < BaseController
    before_action :find_resource_map, only: %i[show update destroy sync graph]

    def index
      @maps = current_account.resource_maps.recent
    end

    def show; end

    def create
      @resource_map = current_account.resource_maps.create!(
        **resource_map_params.to_h.symbolize_keys,
        nodes: [],
        edges: []
      )

      render :create, status: :created
    end

    def update
      @resource_map.update!(resource_map_params)
      render_success
    end

    def destroy
      @resource_map.destroy!
      render_success
    end

    def sync
      settings = Setting.where(account_id: current_account.id).visible.to_h { |s| [s.key, s.value] }

      url = "#{AppConfig.agent_service_url}/api/agent/discover"
      payload = {
        settings: settings,
        existing_nodes: @resource_map.nodes,
        existing_edges: @resource_map.edges
      }

      conn = Faraday.new { |f| f.options.timeout = 60 }
      response = conn.post(url) do |req|
        req.headers['Content-Type'] = 'application/json'
        req.body = payload.to_json
      end

      unless response.success?
        return render_error('Resource discovery failed', status: :bad_gateway)
      end

      result = JSON.parse(response.body)
      @resource_map.save_graph!(result['nodes'], result['edges'])
      @resource_map.touch_last_synced!

      render :show
    end

    def graph
      body = JSON.parse(request.raw_post)
      nodes = body['nodes']
      edges = body['edges']
      groups = body['groups']

      return render_error('nodes and edges arrays are required') unless nodes.is_a?(Array) && edges.is_a?(Array)

      @resource_map.save_graph!(nodes, edges, groups)
      render_success
    end

    private

    def find_resource_map
      @resource_map = current_account.resource_maps.find(params[:id])
    end

    def resource_map_params
      params.permit(:name, :description)
    end
  end
end
