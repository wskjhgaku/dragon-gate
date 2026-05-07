import string
import random
import uvicorn
import socketio
import asyncio
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

app = FastAPI()

@app.get("/ping")
def ping():
    return {"status": "alive"}

app.mount("/", StaticFiles(directory="public", html=True), name="public")

sio = socketio.AsyncServer(async_mode='asgi', cors_allowed_origins='*')
sio_app = socketio.ASGIApp(sio, other_asgi_app=app)

# Global room state
# Structure: { "room_id": { "room_id": "A1B2", "host_sid": "xxx", "players": [...], "status": "waiting" } }
rooms = {}

def generate_room_id():
    """Generates a 4-character uppercase alphanumeric room ID."""
    return ''.join(random.choices(string.ascii_uppercase + string.digits, k=4))

def init_deck():
    """Initializes and shuffles a deck of cards (1-13, 4 suits)."""
    deck = list(range(1, 14)) * 4
    random.shuffle(deck)
    return deck

@sio.event
async def connect(sid, environ):
    print(f"Client connected: {sid}")

@sio.event
async def disconnect(sid):
    print(f"Client disconnected: {sid}")
async def trigger_game_over(room_id):
    room = rooms.get(room_id)
    if not room: return
    room['status'] = "game_over"
    sorted_players = sorted(room['players'], key=lambda x: x['chips'] - x.get('debt', 0), reverse=True)
    await sio.emit('game_over', {'players': sorted_players}, room=room_id)

async def remove_player_from_room(sid, room_id):
    room_data = rooms.get(room_id)
    if not room_data: return
    players = room_data['players']
    player_idx = next((i for i, p in enumerate(players) if p['sid'] == sid), None)
    
    if player_idx is not None:
        player_name = players[player_idx]['name']
        was_turn = False
        if room_data['status'] == 'playing' and player_idx == room_data['turn_index']:
            was_turn = True
            
        players.pop(player_idx)
        await sio.leave_room(sid, room_id)
        
        if room_data['status'] == 'playing':
            if player_idx < room_data['turn_index']:
                room_data['turn_index'] -= 1
            if len(players) > 0:
                room_data['turn_index'] %= len(players)

        if not players:
            del rooms[room_id]
        else:
            if room_data['host_sid'] == sid:
                room_data['host_sid'] = players[0]['sid']
            
            if room_data['status'] == 'playing':
                active_players = [p for p in players if p['chips'] > 0]
                if len(active_players) <= 1:
                    await trigger_game_over(room_id)
                else:
                    await sio.emit('room_updated', room_data, room=room_id)
                    await sio.emit('game_state_updated', room_data, room=room_id)
                    if was_turn:
                        await sio.emit('system_message', f"{player_name} has left the room. Turning to next player...", room=room_id)
                        await advance_turn(room_id)
                    else:
                        await sio.emit('system_message', f"{player_name} has left the room.", room=room_id)
            else:
                await sio.emit('room_updated', room_data, room=room_id)
                await sio.emit('system_message', f"{player_name} has left the room.", room=room_id)

@sio.event
async def disconnect(sid):
    print(f"Client disconnected: {sid}")
    rooms_to_delete = []
    
    for room_id, room_data in list(rooms.items()):
        player_idx = next((i for i, p in enumerate(room_data['players']) if p['sid'] == sid), None)
        if player_idx is not None:
            await remove_player_from_room(sid, room_id)
            break

@sio.event
async def create_room(sid, name):
    room_id = generate_room_id()
    # Ensure room_id uniqueness
    while room_id in rooms:
        room_id = generate_room_id()
        
    rooms[room_id] = {
        "room_id": room_id,
        "host_sid": sid,
        "players": [{"sid": sid, "name": name, "chips": 1100, "is_bot": False, "traumatized": False, "debt": 0, "revivals": 0}],
        "status": "waiting"
    }
    
    # Add user to the socketio room
    await sio.enter_room(sid, room_id)
    # Emit room update back to the creator
    await sio.emit('room_updated', rooms[room_id], to=sid)

@sio.event
async def join_room(sid, data):
    name = data.get('name', 'Anonymous')
    room_id = data.get('room_id', '').upper()
    
    if room_id in rooms:
        room = rooms[room_id]
        if room['status'] == "playing":
            room['players'].append({"sid": sid, "name": name, "chips": 1000, "is_bot": False, "traumatized": False, "debt": 0, "revivals": 0})
            room['pot'] += 100
        else:
            room['players'].append({"sid": sid, "name": name, "chips": 1100, "is_bot": False, "traumatized": False, "debt": 0, "revivals": 0})
            
        await sio.enter_room(sid, room_id)
        # Broadcast the new player list to everyone in the room
        await sio.emit('room_updated', room, room=room_id)
        if room['status'] == "playing":
            await sio.emit('system_message', f"{name} joined the game and paid $100 entry fee!", room=room_id)
            await sio.emit('game_state_updated', room, room=room_id)
    else:
        # Emit an error event back to the joining user
        await sio.emit('error', "Room not found.", to=sid)

@sio.event
async def add_bot(sid, data):
    room_id = data.get('room_id')
    room = rooms.get(room_id)
    if room and room['host_sid'] == sid and room['status'] == "waiting":
        bot_sid = f"bot_{random.randint(1000, 9999)}"
        bot_name = f"Bot_Alpha_{random.randint(10, 99)}"
        room['players'].append({
            "sid": bot_sid,
            "name": bot_name,
            "chips": 1100,
            "is_bot": True,
            "traumatized": False,
            "debt": 0,
            "revivals": 0
        })
        await sio.emit('room_updated', room, room=room_id)

async def bot_play_turn(room_id):
    await asyncio.sleep(random.uniform(1.5, 3.5))
    room = rooms.get(room_id)
    if not room or room['status'] != "playing": return
    
    turn_idx = room['turn_index']
    bot = room['players'][turn_idx]
    
    if not bot.get('is_bot'): return
    
    card1, card2 = room['current_cards']
    gap = abs(card1 - card2)
    
    global_max = min(bot['chips'] // 2, room['pot'])
    max_allowed = min(global_max, room['pot'] // 2) if gap == 2 else global_max
    if max_allowed < 20:
        max_allowed = min(bot['chips'], room['pot'])
        if gap == 2: max_allowed = min(max_allowed, room['pot'] // 2)
    min_allowed = min(20, max_allowed)
    
    base_bet = max(min_allowed, (max_allowed // 10) * 10)
    bet_amount = 0
    guess = None
    rng = random.random()
    
    if gap == 0:
        bet_amount = base_bet
        guess = random.choice(['high', 'low'])
    elif gap == 1:
        bet_amount = 0
    elif gap == 2:
        if max_allowed < 20: bet_amount = max_allowed
        else: bet_amount = min(base_bet, max_allowed)
    else: # gap > 2
        if bot.get('traumatized'):
            if rng < 0.80: bet_amount = min_allowed
            else: bet_amount = base_bet
        else:
            if 3 <= gap <= 7:
                if rng < 0.60: bet_amount = base_bet
                elif rng < 0.90: bet_amount = max_allowed // 2
                else: bet_amount = max_allowed
            elif gap >= 8:
                if rng < 0.80: bet_amount = max_allowed
                else: bet_amount = base_bet

    # Snap to increment of 10 unless it's max_allowed
    if bet_amount % 10 != 0 and bet_amount != max_allowed:
        bet_amount = (bet_amount // 10) * 10
        
    bet_amount = min(max(bet_amount, min_allowed), max_allowed)
    if gap == 1: bet_amount = 0
    
    payload = {'room_id': room_id, 'amount': bet_amount}
    if guess: payload['guess'] = guess
    
    # Call place_bet logic directly
    await place_bet(bot['sid'], payload)

@sio.event
async def start_game(sid, room_id):
    room = rooms.get(room_id)
    if not room or room['host_sid'] != sid:
        return await sio.emit('error', "Unauthorized or room not found.", to=sid)
    
    room['status'] = "playing"
    room['deck'] = init_deck()
    room['pot'] = 0
    room['turn_index'] = 0
    
    # Deduct ante
    for p in room['players']:
        ante = min(100, p['chips'])
        p['chips'] -= ante
        room['pot'] += ante
        
    room['current_cards'] = sorted([room['deck'].pop(), room['deck'].pop()])
    
    await sio.emit('game_state_updated', room, room=room_id)
    
    # Trigger bot if it's bot's turn
    if room['players'][0].get('is_bot'):
        asyncio.create_task(bot_play_turn(room_id))

@sio.event
async def place_bet(sid, data):
    room_id = data.get('room_id')
    amount = int(data.get('amount', 0))
    guess = data.get('guess')
    room = rooms.get(room_id)
    
    if not room or room['status'] != "playing":
        return await sio.emit('error', "Game not active.", to=sid)
        
    turn_idx = room['turn_index']
    player = room['players'][turn_idx]
    
    if player['sid'] != sid:
        return await sio.emit('error', "Not your turn.", to=sid)
        
    card1, card2 = room['current_cards']
    gap = abs(card1 - card2)

    # Validation
    if amount > player['chips'] or amount > room['pot']:
        return await sio.emit('error', "Invalid bet amount (exceeds chips or pot).", to=sid)
        
    if gap == 1:
        if amount != 0: return await sio.emit('error', "Consecutive cards! You must bet 0.", to=sid)
    else:
        global_max = min(player['chips'] // 2, room['pot'])
        max_allowed = min(global_max, room['pot'] // 2) if gap == 2 else global_max
        if max_allowed < 20:
            max_allowed = min(player['chips'], room['pot'])
            if gap == 2: max_allowed = min(max_allowed, room['pot'] // 2)
        min_allowed = min(20, max_allowed)
        
        if amount < min_allowed: return await sio.emit('error', f"Minimum bet is {min_allowed}.", to=sid)
        if amount > max_allowed: return await sio.emit('error', f"Max bet is {max_allowed}.", to=sid)
        if amount % 10 != 0 and amount != max_allowed and amount != player['chips']:
            return await sio.emit('error', "Bet amount must be a multiple of 10.", to=sid)

    if gap == 0 and guess not in ['high', 'low']:
        return await sio.emit('error', "You must guess HIGH or LOW for a pair.", to=sid)

    if gap == 1:
        bet_text = "passed on consecutive cards."
    elif gap == 0:
        bet_text = f"decided to bet ${amount} on {guess.upper()}."
    else:
        bet_text = f"decided to bet ${amount}."
        
    await sio.emit('game_log_message', f"{player['name']} {bet_text}", room=room_id)
    await asyncio.sleep(2.0)
    
    # Verify player is still in the active game after delay
    if player not in room['players'] or room['status'] != 'playing':
        return

    card3 = room['deck'].pop()
    min_c = min(card1, card2)
    max_c = max(card1, card2)
    
    result_msg = ""
    amount_won_lost = 0
    player['traumatized'] = False
    
    if gap == 0:
        if card3 == card1:
            amount_won_lost = -(amount * 3)
            player['chips'] -= amount * 3
            room['pot'] += amount * 3
            player['traumatized'] = True
            result_msg = f"{player['name']} hit SUPER POST! Lost ${amount * 3}!"
        elif (guess == 'high' and card3 > card1) or (guess == 'low' and card3 < card1):
            amount_won_lost = amount
            player['chips'] += amount
            room['pot'] -= amount
            result_msg = f"{player['name']} guessed correctly! Won ${amount}!"
        else:
            amount_won_lost = -amount
            player['chips'] -= amount
            room['pot'] += amount
            result_msg = f"{player['name']} guessed wrong. Lost ${amount}."
    elif gap == 1:
        amount_won_lost = 0
        result_msg = f"{player['name']} passed on consecutive cards."
    elif gap == 2:
        if card3 > min_c and card3 < max_c:
            amount_won_lost = amount * 2
            player['chips'] += amount * 2
            room['pot'] -= amount * 2
            result_msg = f"{player['name']} hit MIDDLE HOLE! Won ${amount * 2}!"
        elif card3 == min_c or card3 == max_c:
            amount_won_lost = -(amount * 2)
            player['chips'] -= amount * 2
            room['pot'] += amount * 2
            player['traumatized'] = True
            result_msg = f"{player['name']} hit the post! Lost ${amount * 2}!"
        else:
            amount_won_lost = -amount
            player['chips'] -= amount
            room['pot'] += amount
            result_msg = f"{player['name']} lost ${amount}."
    else:
        # Normal gap > 2
        if card3 > min_c and card3 < max_c:
            amount_won_lost = amount
            player['chips'] += amount
            room['pot'] -= amount
            result_msg = f"{player['name']} won ${amount}!"
        elif card3 == min_c or card3 == max_c:
            amount_won_lost = -(amount * 2)
            player['chips'] -= amount * 2
            room['pot'] += amount * 2
            player['traumatized'] = True
            result_msg = f"{player['name']} hit the post! Lost ${amount * 2}!"
        else:
            amount_won_lost = -amount
            player['chips'] -= amount
            room['pot'] += amount
            result_msg = f"{player['name']} lost ${amount}."
        
    await sio.emit('turn_result', {
        'message': result_msg,
        'cards': [card1, card3, card2],
        'amount_won_lost': amount_won_lost
    }, room=room_id)
    
    # Wait to let players see the result
    await asyncio.sleep(2.5)
    
    await advance_turn(room_id)

async def advance_turn(room_id):
    room = rooms.get(room_id)
    if not room or room['status'] != "playing": return
    
    # Check pot, re-ante if needed
    if room['pot'] <= 20:
        if room['pot'] < 0:
            room['pot'] = 0
        for p in room['players']:
            if p['chips'] > 0:
                ante = min(100, p['chips'])
                p['chips'] -= ante
                room['pot'] += ante
                
    active_players = [p for p in room['players'] if p['chips'] > 0]
    if len(active_players) <= 1:
        await trigger_game_over(room_id)
        return
        
    original_idx = room['turn_index']
    while True:
        room['turn_index'] = (room['turn_index'] + 1) % len(room['players'])
        if room['players'][room['turn_index']]['chips'] > 0:
            break
        if room['turn_index'] == original_idx:
            break

    # Check deck
    if len(room['deck']) < 3:
        room['deck'] = init_deck()
        
    room['current_cards'] = sorted([room['deck'].pop(), room['deck'].pop()])
    
    await sio.emit('game_state_updated', room, room=room_id)
    
    # Check if next turn is a bot
    next_player = room['players'][room['turn_index']]
    if next_player.get('is_bot'):
        asyncio.create_task(bot_play_turn(room_id))

@sio.event
async def leave_game(sid, data):
    room_id = data.get('room_id')
    await remove_player_from_room(sid, room_id)

@sio.event
async def force_end_game(sid, data):
    room_id = data.get('room_id')
    room = rooms.get(room_id)
    if room and room['host_sid'] == sid:
        await trigger_game_over(room_id)

@sio.event
async def request_revive(sid, data):
    room_id = data.get('room_id')
    room = rooms.get(room_id)
    
    if room:
        for p in room['players']:
            if p['sid'] == sid:
                p['chips'] += 1000
                p['debt'] += 1000
                p['revivals'] += 1
                await sio.emit('system_message', f"{p['name']} has been revived! (Total revivals: {p['revivals']})", room=room_id)
                break
        await sio.emit('game_state_updated', room, room=room_id)
        await sio.emit('room_updated', room, room=room_id)

if __name__ == '__main__':
    uvicorn.run("server:sio_app", host="0.0.0.0", port=8000, reload=True)
