import React, { useState } from 'react';
import type { Command, PageProps, Role, Room } from '../../types';
import { api } from '../../api';
import { ROLES, ROLE_LABEL, card, heading, inputClass, label, muted, primaryButton, roomCommands, secondaryButton, useBusy, warningBox, roleIcon } from '../../ui';
import Icon from '../ui/Icon';
import { ChannelBadge, Chip } from '../ui/Controls';
import RecordSheet from './RecordSheet';

const RoomForm: React.FC<{ room: Room; buttonCount: number; others: Room[]; busy: boolean; onSave: (name: string, channel: number) => void }> =
  ({ room, buttonCount, others, busy, onSave }) => {
    const [name, setName] = useState(room.name);
    const [channel, setChannel] = useState(room.channel);
    const dirty = name.trim() !== room.name || channel !== room.channel;
    const sharing = others.filter(r => r.channel === channel);
    return (
      <section className={`${card} p-4 space-y-3`}>
        <label className={`text-xs font-semibold ${muted} block`}>
          Name
          <input value={name} onChange={e => setName(e.target.value)} maxLength={60} className={`${inputClass} mt-1`} />
        </label>
        <div>
          <span className={`text-xs font-semibold ${muted} block mb-1.5`}>Remote channel</span>
          <div className="flex gap-2">
            {[1, 2, 3].map(ch => <Chip key={ch} selected={ch === channel} onClick={() => setChannel(ch)}>CH{ch}</Chip>)}
          </div>
        </div>
        {channel !== room.channel && buttonCount > 0 && (
          <div className={warningBox}>Saving converts this room's {buttonCount} button(s) to CH{channel}. Switch the light itself to CH{channel} too.</div>
        )}
        {sharing.length > 0 && (
          <div className={warningBox}>{sharing.map(r => r.name).join(', ')} also use CH{channel}; lights on the same channel react to each other's buttons.</div>
        )}
        {dirty && (
          <button onClick={() => onSave(name.trim(), channel)} disabled={busy || !name.trim()} className={`${primaryButton} w-full`}>Save room</button>
        )}
      </section>
    );
  };

const ButtonRow: React.FC<{ cmd: Command; busy: boolean; onTest: () => void; onSave: (patch: { name?: string; role?: Role | null }) => void; onDelete: () => void }> =
  ({ cmd, busy, onTest, onSave, onDelete }) => {
    const [editing, setEditing] = useState(false);
    const [name, setName] = useState(cmd.name);
    const [role, setRole] = useState<Role | ''>(cmd.role ?? '');
    return (
      <li className="py-3">
        <div className="flex items-center gap-3">
          <span className="w-9 h-9 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-gray-600 dark:text-gray-300 shrink-0">
            <Icon name={roleIcon(cmd.role)} />
          </span>
          <div className="flex-1 min-w-0">
            <div className={`font-medium ${heading} truncate`}>{label(cmd)}</div>
            <div className={`text-xs ${muted} truncate`}>
              {cmd.role && cmd.name}{cmd.derived && <>{cmd.role && ' · '}generated</>}
            </div>
          </div>
          <button onClick={onTest} disabled={busy} className="text-sm font-medium px-2.5 py-1.5 rounded-lg text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950 disabled:opacity-40">Test</button>
          <button onClick={() => setEditing(e => !e)} className={`p-2 rounded-lg ${muted} hover:bg-gray-100 dark:hover:bg-gray-800`} aria-label="Edit"><Icon name="edit" className="w-4 h-4" /></button>
        </div>
        {editing && (
          <div className="mt-3 ml-12 grid grid-cols-2 gap-3">
            <label className={`text-xs font-semibold ${muted}`}>
              Function
              <select value={role} onChange={e => setRole(e.target.value as Role | '')} className={`${inputClass} mt-1 text-sm py-1.5`}>
                <option value="">Custom button</option>
                {ROLES.map(r => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
              </select>
            </label>
            <label className={`text-xs font-semibold ${muted}`}>
              Name
              <input value={name} onChange={e => setName(e.target.value)} maxLength={60} className={`${inputClass} mt-1 text-sm py-1.5`} />
            </label>
            <div className="col-span-2 flex gap-2">
              <button onClick={onDelete} disabled={busy} className="text-sm font-medium px-3 py-1.5 rounded-lg text-red-600 hover:bg-red-50 dark:hover:bg-red-950 disabled:opacity-40">Delete</button>
              <div className="flex-1" />
              <button onClick={() => { setEditing(false); setName(cmd.name); setRole(cmd.role ?? ''); }} className={`${secondaryButton} !py-1.5 text-sm`}>Cancel</button>
              <button
                onClick={() => { onSave({ name: name.trim(), role: role || null }); setEditing(false); }}
                disabled={busy || !name.trim() || (name.trim() === cmd.name && (role || null) === cmd.role)}
                className={`${primaryButton} !py-1.5 text-sm`}
              >Save</button>
            </div>
          </div>
        )}
      </li>
    );
  };

const RoomDetail: React.FC<PageProps & { room: Room }> = ({ config, room, refresh, notify, navigate }) => {
  const { busy, run } = useBusy(notify);
  const [recording, setRecording] = useState(false);
  const [copyFrom, setCopyFrom] = useState('');
  const buttons = roomCommands(config, room.id);
  const others = config.rooms.filter(r => r.id !== room.id);

  const saveRoom = (name: string, channel: number) => run('room', async () => {
    const res = await api<{ not_rewritten: string[] }>('PUT', `/rooms/${room.id}`, { name, channel });
    if (res.not_rewritten.length) notify(`Saved. Record these again for CH${channel}: ${res.not_rewritten.join(', ')}`, 'error');
    else notify('Room saved');
    await refresh();
  });

  const test = (cmd: Command) => run(`test:${cmd.id}`, async () => {
    await api('POST', `/commands/${cmd.id}/send`);
    notify(`Sent ${label(cmd)}`);
  });

  const saveButton = (cmd: Command, patch: { name?: string; role?: Role | null }) => run(`btn:${cmd.id}`, async () => {
    await api('PATCH', `/commands/${cmd.id}`, patch);
    await refresh();
  });

  const deleteButton = (cmd: Command) => {
    if (!window.confirm(`Delete “${label(cmd)}” from ${room.name}?`)) return;
    run(`btn:${cmd.id}`, async () => {
      await api('DELETE', `/commands/${cmd.id}`);
      notify(`Deleted ${label(cmd)}`);
      await refresh();
    });
  };

  const copyMissing = () => run('copy', async () => {
    const res = await api<{ added: Command[]; unsupported: string[] }>('POST', `/rooms/${room.id}/copy-missing`, { from_room_id: copyFrom });
    if (res.unsupported.length) notify(`Can't convert (unrecognised): ${res.unsupported.join(', ')}; record them instead`, 'error');
    notify(res.added.length ? `Added ${res.added.map(label).join(', ')}` : 'Nothing missing');
    setCopyFrom('');
    await refresh();
  });

  const deleteRoom = () => {
    if (!window.confirm(`Delete ${room.name}?`)) return;
    run('delete', async () => {
      await api('DELETE', `/rooms/${room.id}`);
      navigate('settings');
      await refresh();
    });
  };

  const missingFrom = (source: Room) => config.commands.filter(c => c.room_id === source.id
    && !buttons.some(b => (c.role && b.role === c.role) || b.name.toLowerCase() === c.name.toLowerCase())).length;

  return (
    <div className="space-y-4 max-w-2xl">
      <button onClick={() => navigate('settings')} className={`flex items-center gap-1 text-sm font-medium ${muted} hover:underline -ml-1`}>
        <Icon name="back" className="w-4 h-4" /> Settings
      </button>
      <div className="flex items-center gap-2">
        <h1 className={`text-2xl font-bold tracking-tight ${heading}`}>{room.name}</h1>
        <ChannelBadge channel={room.channel} />
      </div>

      <RoomForm key={`${room.name}:${room.channel}`} room={room} buttonCount={buttons.length} others={others} busy={busy !== null} onSave={saveRoom} />

      <section className={`${card} p-4`}>
        <div className="flex items-center justify-between">
          <h2 className={`font-semibold ${heading}`}>Buttons</h2>
          <button onClick={() => setRecording(true)} className={`${primaryButton} !py-1.5 text-sm flex items-center gap-1.5`}>
            <Icon name="plus" className="w-4 h-4" /> Add button
          </button>
        </div>
        {buttons.length === 0 && <p className={`text-sm ${muted} mt-3`}>No buttons yet. Record them, or copy them from another room below.</p>}
        <ul className="divide-y divide-gray-100 dark:divide-gray-800">
          {buttons.map(cmd => (
            <ButtonRow key={`${cmd.id}:${cmd.name}:${cmd.role}`} cmd={cmd} busy={busy !== null}
                       onTest={() => test(cmd)} onSave={p => saveButton(cmd, p)} onDelete={() => deleteButton(cmd)} />
          ))}
        </ul>
      </section>

      {others.length > 0 && (
        <section className={`${card} p-4 space-y-3`}>
          <h2 className={`font-semibold ${heading}`}>Copy buttons from another room</h2>
          <p className={`text-sm ${muted}`}>Buttons this room is missing are converted to CH{room.channel}, so you don't need to record them.</p>
          <div className="flex gap-2">
            <select value={copyFrom} onChange={e => setCopyFrom(e.target.value)} className={inputClass}>
              <option value="">Choose a room…</option>
              {others.map(r => <option key={r.id} value={r.id}>{r.name} ({missingFrom(r)} missing here)</option>)}
            </select>
            <button onClick={copyMissing} disabled={!copyFrom || busy !== null} className={`${secondaryButton} shrink-0`}>Copy</button>
          </div>
        </section>
      )}

      <button onClick={deleteRoom} disabled={buttons.length > 0 || busy !== null}
              className="text-sm font-medium text-red-600 disabled:text-gray-400 disabled:cursor-not-allowed"
              title={buttons.length > 0 ? 'Delete its buttons first' : undefined}>
        Delete room
      </button>

      {recording && <RecordSheet config={config} room={room} notify={notify} onClose={() => setRecording(false)} onSaved={refresh} />}
    </div>
  );
};

export default RoomDetail;
