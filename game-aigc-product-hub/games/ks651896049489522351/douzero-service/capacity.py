"""Non-queuing admission control for CPU-bound inference."""

from __future__ import annotations

import asyncio


class FastFailCapacity:
    def __init__(self, maximum: int) -> None:
        self.maximum = maximum
        self.in_flight = 0
        self._lock = asyncio.Lock()

    async def try_acquire(self) -> bool:
        async with self._lock:
            if self.in_flight >= self.maximum:
                return False
            self.in_flight += 1
            return True

    async def release(self) -> None:
        async with self._lock:
            self.in_flight = max(0, self.in_flight - 1)
