from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

# Resolve the project root .env (two levels up from this file)
_env_file = Path(__file__).resolve().parents[2] / ".env"


class AppConfig(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(_env_file),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    openai_model: str = "codex-mini-latest"
    openai_summary_model: str = "gpt-4.1-mini"
    agent_max_iterations: int = 10
    agent_max_tool_calls_per_iteration: int = 5


app_config = AppConfig()
