"""
工具模块
"""

from .locale import t, get_locale, set_locale, get_language_instruction

import os

if os.environ.get("AGW_X_DRAMA_ONLY") == "1":
    __all__ = ['t', 'get_locale', 'set_locale', 'get_language_instruction']
else:
    from .file_parser import FileParser
    from .llm_client import LLMClient
    __all__ = ['FileParser', 'LLMClient', 't', 'get_locale', 'set_locale', 'get_language_instruction']
