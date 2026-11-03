"""DouZero compatible feature encoding for Node-provided legal candidates."""

from __future__ import annotations

from collections import Counter
from typing import Any

import numpy as np

POSITIONS = ("landlord", "landlord_down", "landlord_up")
CARD_RANKS = tuple(range(3, 15)) + (17, 20, 30)
NORMAL_COLUMNS = {rank: index for index, rank in enumerate(tuple(range(3, 15)) + (17,))}
FULL_DECK = Counter({rank: 4 for rank in tuple(range(3, 15)) + (17,)})
FULL_DECK.update({20: 1, 30: 1})


class FeatureError(ValueError):
    """Raised when a request cannot represent a valid public game state."""


def _cards_to_array(cards: list[int]) -> np.ndarray:
    counts = Counter(cards)
    matrix = np.zeros((4, 13), dtype=np.int8)
    jokers = np.zeros(2, dtype=np.int8)
    for rank, count in counts.items():
        if rank not in CARD_RANKS or count < 1 or count > FULL_DECK[rank]:
            raise FeatureError(f"invalid_card_count:{rank}")
        if rank in NORMAL_COLUMNS:
            matrix[:count, NORMAL_COLUMNS[rank]] = 1
        elif rank == 20:
            jokers[0] = 1
        elif rank == 30:
            jokers[1] = 1
    return np.concatenate((matrix.flatten(order="F"), jokers))


def _one_hot_cards_left(count: int, maximum: int) -> np.ndarray:
    if count < 1 or count > maximum:
        raise FeatureError(f"invalid_cards_left:{count}:{maximum}")
    result = np.zeros(maximum, dtype=np.int8)
    result[count - 1] = 1
    return result


def _bomb_one_hot(count: int) -> np.ndarray:
    if count < 0 or count > 14:
        raise FeatureError(f"invalid_bomb_count:{count}")
    result = np.zeros(15, dtype=np.int8)
    result[count] = 1
    return result


def _history_array(sequence: list[list[int]]) -> np.ndarray:
    recent = [list(action) for action in sequence[-15:]]
    padded = ([[]] * (15 - len(recent))) + recent
    return np.stack([_cards_to_array(action) for action in padded]).reshape(5, 162)


def _unknown_cards(hand: list[int], played_cards: dict[str, list[int]]) -> list[int]:
    remaining = FULL_DECK.copy()
    for rank in hand:
        remaining[rank] -= 1
    for position in POSITIONS:
        for rank in played_cards[position]:
            remaining[rank] -= 1
    if any(count < 0 for count in remaining.values()):
        raise FeatureError("known_cards_exceed_deck")
    cards: list[int] = []
    for rank in CARD_RANKS:
        cards.extend([rank] * remaining[rank])
    return cards


def _repeat(feature: np.ndarray, size: int) -> np.ndarray:
    return np.repeat(feature[np.newaxis, :], size, axis=0)


def build_feature_batches(payload: dict[str, Any]) -> tuple[np.ndarray, np.ndarray]:
    position = payload["position"]
    candidates = payload["candidates"]
    if position not in POSITIONS or not candidates:
        raise FeatureError("invalid_position_or_candidates")

    hand = list(payload["hand"])
    played = {key: list(payload["played_cards"][key]) for key in POSITIONS}
    counts = {key: int(payload["num_cards_left"][key]) for key in POSITIONS}
    if len(hand) != counts[position]:
        raise FeatureError("self_hand_count_mismatch")
    played_count = sum(len(played[key]) for key in POSITIONS)
    if sum(counts.values()) + played_count != 54:
        raise FeatureError("deck_count_mismatch")
    for key in POSITIONS:
        initial_count = 20 if key == "landlord" else 17
        if counts[key] + len(played[key]) != initial_count:
            raise FeatureError(f"position_card_count_mismatch:{key}")

    other_cards = _unknown_cards(hand, played)
    expected_other = sum(counts[key] for key in POSITIONS if key != position)
    if len(other_cards) != expected_other:
        raise FeatureError("other_hand_count_mismatch")

    action_cards = [list(candidate["cards"]) for candidate in candidates]
    hand_counter = Counter(hand)
    for cards in action_cards:
        if any(count > hand_counter[rank] for rank, count in Counter(cards).items()):
            raise FeatureError("candidate_not_in_hand")
    sequence_cards = Counter(card for action in payload["action_sequence"] for card in action)
    played_card_counts = Counter(card for cards in played.values() for card in cards)
    if sequence_cards != played_card_counts:
        raise FeatureError("history_played_cards_mismatch")
    size = len(action_cards)
    hand_batch = _repeat(_cards_to_array(hand), size)
    other_batch = _repeat(_cards_to_array(other_cards), size)
    last_move_batch = _repeat(_cards_to_array(list(payload["last_move"])), size)
    bomb_batch = _repeat(_bomb_one_hot(int(payload["bomb_count"])), size)
    action_batch = np.stack([_cards_to_array(cards) for cards in action_cards])

    if position == "landlord":
        x_batch = np.hstack((
            hand_batch,
            other_batch,
            last_move_batch,
            _repeat(_cards_to_array(played["landlord_up"]), size),
            _repeat(_cards_to_array(played["landlord_down"]), size),
            _repeat(_one_hot_cards_left(counts["landlord_up"], 17), size),
            _repeat(_one_hot_cards_left(counts["landlord_down"], 17), size),
            bomb_batch,
            action_batch,
        ))
    else:
        teammate = "landlord_down" if position == "landlord_up" else "landlord_up"
        last_by_position = payload["last_move_by_position"]
        x_batch = np.hstack((
            hand_batch,
            other_batch,
            _repeat(_cards_to_array(played["landlord"]), size),
            _repeat(_cards_to_array(played[teammate]), size),
            last_move_batch,
            _repeat(_cards_to_array(list(last_by_position["landlord"])), size),
            _repeat(_cards_to_array(list(last_by_position[teammate])), size),
            _repeat(_one_hot_cards_left(counts["landlord"], 20), size),
            _repeat(_one_hot_cards_left(counts[teammate], 17), size),
            bomb_batch,
            action_batch,
        ))

    z = _history_array(payload["action_sequence"])
    z_batch = np.repeat(z[np.newaxis, :, :], size, axis=0)
    expected_width = 373 if position == "landlord" else 484
    if x_batch.shape != (size, expected_width) or z_batch.shape != (size, 5, 162):
        raise FeatureError("feature_shape_mismatch")
    return np.ascontiguousarray(x_batch, dtype=np.float32), np.ascontiguousarray(z_batch, dtype=np.float32)
