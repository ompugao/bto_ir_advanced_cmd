import React, { useState } from 'react';
import type { PageProps, Room } from '../types';
import { api } from '../api';
import { channelStyle, inputClass, primaryButton, useBusy } from '../ui';

const CHANNELS = [1, 2, 3];

const ChannelPicker: React.FC<{ value: number; onChange: (ch: number) => void }> = ({ value, onChange }) => (
  <div className="flex gap-1">
    {CHANNELS.map(ch => (
      <button
        key={ch}
        type="button"
        onClick={() => onChange(ch)}
        className={`px-2.5 py-1.5 rounded-lg text-xs font-bold border ${value === ch ? channelStyle(ch) : 'bg-white border-gray-200 text-gray-400 hover:bg-gray-50'}`}
      >
        CH{ch}
      </button>
    ))}
  </div>
);

const RoomRow: React.FC<{ room: Room; others: Room[]; commandCount: number; busy: boolean; onSave: (r: Room) => void; onDelete: (r: Room) => void }> =
  ({ room, others, commandCount, busy, onSave, onDelete }) => {
    const [name, setName] = useState(room.name);
    const [channel, setChannel] = useState(room.channel);
    const dirty = name.trim() !== room.name || channel !== room.channel;
    const sharedWith = others.filter(r => r.channel === channel);
    return (
      <div className="bg-gray-50 border border-gray-200 p-4 rounded-xl space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <input type="text" value={name} maxLength={60} onChange={e => setName(e.target.value)} className={`${inputClass} flex-1 min-w-[10rem]`} />
          <ChannelPicker value={channel} onChange={setChannel} />
        </div>
        {channel !== room.channel && commandCount > 0 && (
          <p className="text-xs text-amber-700">Saving rewrites this room's {commandCount} button(s) for CH{channel}. Set the light itself to CH{channel} too.</p>
        )}
        {sharedWith.length > 0 && (
          <p className="text-xs text-amber-700">{sharedWith.map(r => r.name).join(', ')} also use CH{channel}; lights on the same channel react to each other's codes.</p>
        )}
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-500">{commandCount} button{commandCount === 1 ? '' : 's'}</span>
          <div className="flex gap-2">
            <button onClick={() => onDelete(room)} disabled={busy || commandCount > 0} title={commandCount > 0 ? 'Delete its buttons first' : 'Delete room'} className="text-xs font-medium text-gray-500 hover:text-red-600 disabled:opacity-40 px-2">
              Delete
            </button>
            <button onClick={() => onSave({ ...room, name: name.trim(), channel })} disabled={busy || !dirty || !name.trim()} className="text-xs font-medium bg-blue-600 text-white px-3 py-1.5 rounded-lg disabled:opacity-40">
              Save
            </button>
          </div>
        </div>
      </div>
    );
  };

const Rooms: React.FC<PageProps> = ({ config, refresh, notify }) => {
  const { busy, run } = useBusy(notify);
  const [name, setName] = useState('');
  const [channel, setChannel] = useState(1);
  const [copyFrom, setCopyFrom] = useState('');

  const count = (roomId: string) => config.commands.filter(c => c.room_id === roomId).length;

  const addRoom = () => run('add', async () => {
    const res = await api<{ room: Room; skipped: string[] }>('POST', '/rooms', {
      name: name.trim(), channel, copy_from_room_id: copyFrom || null,
    });
    notify(res.skipped.length
      ? `Added ${res.room.name}; not copied (unknown code format): ${res.skipped.join(', ')}`
      : `Added ${res.room.name}`, res.skipped.length ? 'error' : 'success');
    setName('');
    setCopyFrom('');
    await refresh();
  });

  const saveRoom = (room: Room) => run(`room:${room.id}`, async () => {
    const res = await api<{ not_rewritten: string[] }>('PUT', `/rooms/${room.id}`, { name: room.name, channel: room.channel });
    notify(res.not_rewritten.length
      ? `Saved. These buttons could not be rewritten for CH${room.channel}; record them again: ${res.not_rewritten.join(', ')}`
      : 'Room saved', res.not_rewritten.length ? 'error' : 'success');
    await refresh();
  });

  const deleteRoom = (room: Room) => {
    if (!window.confirm(`Delete ${room.name}?`)) return;
    run(`room:${room.id}`, async () => {
      await api('DELETE', `/rooms/${room.id}`);
      await refresh();
    });
  };

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold tracking-tight text-gray-900">Rooms</h2>

      <div className="glass-panel rounded-2xl p-6 sm:p-8 space-y-4">
        <p className="text-sm text-gray-500 leading-relaxed">
          Each room has a light whose remote is set to a channel (CH1–3). The channel is part of every IR code, so each room
          has its own buttons. For supported lights, buttons can be copied to another room and converted to its channel
          instead of recording them again.
        </p>
        {config.rooms.map(room => (
          <RoomRow
            key={`${room.id}:${room.name}:${room.channel}`}
            room={room}
            others={config.rooms.filter(r => r.id !== room.id)}
            commandCount={count(room.id)}
            busy={busy !== null}
            onSave={saveRoom}
            onDelete={deleteRoom}
          />
        ))}
      </div>

      <div className="glass-panel rounded-2xl p-6 sm:p-8 space-y-4">
        <h3 className="text-lg font-semibold text-gray-900">Add Room</h3>
        <div className="flex flex-wrap items-center gap-3">
          <input type="text" value={name} maxLength={60} onChange={e => setName(e.target.value)} placeholder="e.g. Bedroom" className={`${inputClass} flex-1 min-w-[10rem]`} />
          <ChannelPicker value={channel} onChange={setChannel} />
        </div>
        {config.rooms.length > 0 && (
          <div>
            <label className="text-xs font-semibold text-gray-600 mb-1.5 block">Copy buttons from</label>
            <select value={copyFrom} onChange={e => setCopyFrom(e.target.value)} className={inputClass}>
              <option value="">Nothing (record them later)</option>
              {config.rooms.map(r => <option key={r.id} value={r.id}>{r.name} ({count(r.id)} buttons)</option>)}
            </select>
          </div>
        )}
        <button onClick={addRoom} disabled={busy !== null || !name.trim()} className={`${primaryButton} w-full`}>
          {busy === 'add' ? 'Adding…' : 'Add Room'}
        </button>
      </div>
    </div>
  );
};

export default Rooms;
