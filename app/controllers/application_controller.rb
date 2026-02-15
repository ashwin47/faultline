class ApplicationController < ActionController::API
  include Pundit::Authorization

  rescue_from ActiveRecord::RecordNotFound, with: :not_found
  rescue_from ActiveRecord::RecordInvalid, with: :unprocessable
  rescue_from ArgumentError, with: :bad_request

  private

  def not_found(exception)
    render_error(exception.message, status: :not_found)
  end

  def unprocessable(exception)
    render_error(exception.record.errors.full_messages.join(', '), status: :unprocessable_content)
  end

  def bad_request(exception)
    render_error(exception.message, status: :bad_request)
  end

  def render_error(message, status: :bad_request)
    @error_message = message
    render 'shared/error', status: status
  end

  def render_success
    render 'shared/success'
  end

  def render_message(text)
    @message_text = text
    render 'shared/message'
  end
end
