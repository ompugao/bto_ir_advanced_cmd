import React, { useState } from 'react';
import type { PageProps, Room } from '../../types';
import { api } from '../../api';
import { card, heading, inputClass, muted, primaryButton, useBusy } from '../../ui';
import Icon from '../ui/Icon';
import { ChannelBadge, Chip } from '../ui/Controls';
import Sheet from '../ui/Sheet';
import RoomDetail from './RoomDetail';

const AddRoomSheet: React.FC<PageProps & { onClose: () => void }> = ({ config, refresh, notify, navigate, onClose }) => {
  const { busy, run } = useBusy(notify);
  const used = new Set(config.rooms.map(r => r.channel));
  const [name, setName] = useState('');
  const [channel, setChannel] = useState([1, 2, 3].find(ch => !used.has(ch)) ?? 1);
  const [copyFrom, setCopyFrom] = useState(config.rooms[0]?.id ?? '');

  const add = () => run('add', async () => {
    const res = await api<{ room: Room; skipped: string[] }>('POST', '/rooms', { name: name.trim(), channel, copy_from_room_id: copyFrom || null });
    if (res.skipped.length) notify(`Not copied (unrecognised): ${res.skipped.join(', ')}`, 'error');
    notify(`Added ${res.room.name}`);
    await refresh();
    onClose();
    navigate(`settings/${res.room.id}`);
  });

  return (
    <Sheet title="Add room" onClose={onClose}
           footer={<button onClick={add} disabled={!name.trim() || busy !== null} className={`${primaryButton} w-full`}>{busy ? 'Adding…' : 'Add room'}</button>}>
      <label className={`text-xs font-semibold ${muted} block`}>
        Name
        <input value={name} onChange={e => setName(e.target.value)} maxLength={60} placeholder="e.g. Bed Room" className={`${inputClass} mt-1`} autoFocus />
      </label>
      <div>
        <span className={`text-xs font-semibold ${muted} block mb-1.5`}>Remote channel</span>
        <div className="flex gap-2">
          {[1, 2, 3].map(ch => <Chip key={ch} selected={ch === channel} onClick={() => setChannel(ch)}>CH{ch}{used.has(ch) ? ' · in use' : ''}</Chip>)}
        </div>
      </div>
      {config.rooms.length > 0 && (
        <label className={`text-xs font-semibold ${muted} block`}>
          Start with buttons from
          <select value={copyFrom} onChange={e => setCopyFrom(e.target.value)} className={`${inputClass} mt-1`}>
            <option value="">Nothing — I'll record them</option>
            {config.rooms.map(r => <option key={r.id} value={r.id}>{r.name} (converted to CH{channel})</option>)}
          </select>
        </label>
      )}
    </Sheet>
  );
};

const Settings: React.FC<PageProps & { roomId?: string }> = (props) => {
  const { config, status, navigate, roomId } = props;
  const [adding, setAdding] = useState(false);

  const room = roomId ? config.rooms.find(r => r.id === roomId) : undefined;
  if (room) return <RoomDetail {...props} room={room} />;

  return (
    <div className="space-y-4 max-w-2xl">
      <h1 className={`text-2xl font-bold tracking-tight ${heading}`}>Settings</h1>

      <section className={card}>
        <div className="flex items-center justify-between px-4 pt-4 pb-2">
          <h2 className={`font-semibold ${heading}`}>Rooms</h2>
          <button onClick={() => setAdding(true)} className="text-sm font-medium flex items-center gap-1 text-blue-600 dark:text-blue-400 px-2 py-1 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-950">
            <Icon name="plus" className="w-4 h-4" /> Add room
          </button>
        </div>
        <ul className="divide-y divide-gray-100 dark:divide-gray-800">
          {config.rooms.map(r => {
            const count = config.commands.filter(c => c.room_id === r.id).length;
            return (
              <li key={r.id}>
                <button onClick={() => navigate(`settings/${r.id}`)} className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-800/50">
                  <div className="flex-1 min-w-0">
                    <div className={`font-medium ${heading}`}>{r.name}</div>
                    <div className={`text-xs ${muted}`}>{count} button{count === 1 ? '' : 's'}</div>
                  </div>
                  <ChannelBadge channel={r.channel} />
                  <Icon name="chevron" className={`w-4 h-4 ${muted}`} />
                </button>
              </li>
            );
          })}
          {config.rooms.length === 0 && <li className={`px-4 py-3 text-sm ${muted}`}>No rooms yet.</li>}
        </ul>
      </section>

      <section className={`${card} p-4 flex items-center gap-3`}>
        <Icon name="signal" className={`w-5 h-5 ${muted}`} />
        <div className="flex-1">
          <div className={`font-medium ${heading}`}>USB IR receiver</div>
          <div className={`text-xs ${muted}`}>Bit Trade One Advanced USB IR Remote Controller</div>
        </div>
        {status?.device_connected === true && <span className="text-sm font-medium text-green-600 dark:text-green-400">Connected</span>}
        {status?.device_connected === false && <span className="text-sm font-medium text-red-600 dark:text-red-400">Not found</span>}
        {(status?.device_connected ?? null) === null && <span className={`text-sm ${muted}`}>Unknown</span>}
      </section>

      {adding && <AddRoomSheet {...props} onClose={() => setAdding(false)} />}
    </div>
  );
};

export default Settings;
