class SpaController < ActionController::Base
  layout 'application'

  def index
    render :index, content_type: 'text/html'
  end
end
