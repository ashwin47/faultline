module API
  class AuthController < BaseController
    skip_before_action :authenticate_user!, only: %i[signup login verify_email resend_verification]

    def signup
      result = AuthService.signup(
        email: auth_params[:email],
        password: auth_params[:password],
        name: auth_params[:name]
      )

      if result[:auto_confirmed]
        @message_text = 'Account created successfully. You can now log in.'
        @auto_confirmed = true
      else
        @message_text = 'Account created. Please check your email to verify your account.'
        @auto_confirmed = false
      end
    rescue StandardError => e
      render_error(e.message)
    end

    def login
      @user = User.find_by(email: auth_params[:email])

      unless @user&.valid_password?(auth_params[:password])
        return render_error('Invalid email or password', status: :unauthorized)
      end

      unless @user.email_verified?
        return render_error('Please verify your email before logging in', status: :unauthorized)
      end

      result = AuthService.login(user: @user, ip_address: request.remote_ip, user_agent: request.user_agent)
      @token, _payload = Warden::JWTAuth::UserEncoder.new.call(@user, :user, nil)
      @account = Account.find(result[:account][:id])
      @role = result[:role]
    rescue StandardError => e
      render_error(e.message, status: :unauthorized)
    end

    def logout
      sign_out(current_user)
      render_message('Logged out successfully')
    end

    def verify_email
      token = params.require(:token)

      AuthService.verify_email(token)
      render_message('Email verified successfully. You can now log in.')
    rescue StandardError => e
      render_error(e.message)
    end

    def me
      @user = current_user
      @accounts = Account.for_user(@user.id).map do |a|
        role = a.member_role(@user.id)
        { id: a.id, name: a.name, slug: a.slug, role: role }
      end

      @current_account = @accounts.find { |a| a[:id] == current_account_id } || @accounts.first
      @pending_invites = WorkspaceService.pending_invites_for_user(@user.email)
    end

    def switch_account
      account_id = params.require(:account_id)

      result = AuthService.switch_account(user: current_user, account_id: account_id)
      @token, _payload = Warden::JWTAuth::UserEncoder.new.call(current_user.reload, :user, nil)
      @account = Account.find(account_id)
      @role = result[:role]
    rescue StandardError => e
      render_error(e.message)
    end

    def resend_verification
      email = params.require(:email)

      AuthService.resend_verification(email)
      render_message('If an account exists with this email, a verification email has been sent.')
    end

    def sessions
      @sessions = current_user.sessions.order(created_at: :desc)
    end

    def destroy_session
      current_user.sessions.find(params[:id]).destroy!
      render_message('Session revoked')
    end

    private

    def auth_params
      params.permit(:email, :password, :name)
    end
  end
end
