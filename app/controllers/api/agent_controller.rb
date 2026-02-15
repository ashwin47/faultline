module API
  class AgentController < BaseController
    def index
      @conversations = current_account.conversations.recent.includes(:messages)
    end

    def show
      @conversation = current_account.conversations.find(params[:id])
    end

    def destroy
      current_account.conversations.find(params[:id]).destroy!
      render_success
    end

    def models
      @models = [
        { id: 'gpt-5.3-codex', label: 'GPT-5.3 Codex' },
        { id: 'gpt-5.2-codex', label: 'GPT-5.2 Codex' },
        { id: 'gpt-5.1-codex', label: 'GPT-5.1 Codex' },
        { id: 'gpt-5-codex', label: 'GPT-5 Codex' },
        { id: 'gpt-5-codex-mini', label: 'GPT-5 Codex Mini' },
        { id: 'codex-mini-latest', label: 'Codex Mini' },
        { id: 'gpt-5.2', label: 'GPT-5.2' },
        { id: 'gpt-5.1', label: 'GPT-5.1' },
        { id: 'gpt-5', label: 'GPT-5' },
        { id: 'o3', label: 'o3' },
        { id: 'o3-pro', label: 'o3 Pro' },
        { id: 'o4-mini', label: 'o4 Mini' },
        { id: 'gpt-4.1', label: 'GPT-4.1' },
        { id: 'gpt-4.1-mini', label: 'GPT-4.1 Mini' }
      ]
    end
  end
end
