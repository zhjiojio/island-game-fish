"""
API路由模块
"""

from flask import Blueprint

graph_bp = Blueprint('graph', __name__)
simulation_bp = Blueprint('simulation', __name__)
report_bp = Blueprint('report', __name__)
drama_bp = Blueprint('drama', __name__)

import os

if os.environ.get("AGW_X_DRAMA_ONLY") == "1":
    from . import drama  # noqa: E402, F401
else:
    from . import graph  # noqa: E402, F401
    from . import simulation  # noqa: E402, F401
    from . import report  # noqa: E402, F401
    from . import drama  # noqa: E402, F401
