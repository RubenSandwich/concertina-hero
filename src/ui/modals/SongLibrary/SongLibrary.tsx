import { useState } from 'react'
import {
  getSongs,
  deleteSong,
  saveSong,
  importSongJSON,
} from '#data/songLibrary'
import { DIFF_CLASS, type Song } from '#data/songs'
import Modal from '#components/Modal/Modal'
import UploadButton from '#components/UploadButton/UploadButton'
import ListRow from '#components/ListRow/ListRow'
import SongEditor, { type SongDraft } from '#modals/SongEditor/SongEditor'

interface SongLibraryProps {
  onClose: () => void
  onChange?: () => void
  onSelect?: (id: string) => void
}

type Editing = 'new' | { song: Song } | null

// A full-page modal listing every song. Built-in songs are locked; user songs
// can be edited or deleted, and you can write a new one or upload a chart.
// Editing/creating opens the SongEditorModal on top of this one.
export default function SongLibrary({
  onClose,
  onChange,
  onSelect,
}: SongLibraryProps) {
  const [songs, setSongs] = useState<Song[]>(() => getSongs())
  const [editing, setEditing] = useState<Editing>(null)
  const [uploadError, setUploadError] = useState('')

  // Re-read the store after any change and tell the parent to refresh too.
  const refresh = () => {
    setSongs(getSongs())
    onChange?.()
  }

  const remove = (id: string) => {
    deleteSong(id)
    refresh()
  }

  const handleSave = (def: SongDraft) => {
    const saved = saveSong(def) // throws on invalid -> caught in the editor
    refresh()
    onSelect?.(saved.id)
    setEditing(null)
  }

  const handleUpload = (data: unknown) => {
    const saved = importSongJSON(data) // throws on invalid -> shown via onError
    refresh()
    onSelect?.(saved.id)
  }

  return (
    <>
      <Modal title="Song library" onClose={onClose}>
        <p className="modal__hint">
          Edit or delete your songs, write a new one, or upload a chart.
        </p>

        <div className="modal__body">
          <ul className="list-rows" aria-label="Songs">
            {songs.map((s) => (
              <ListRow
                key={s.id}
                name={s.name}
                color={s.color}
                noun="song"
                meta={
                  <>
                    <span className={'diff ' + DIFF_CLASS[s.difficulty]}>
                      {s.difficulty}
                    </span>
                    <span className="list-row__bpm">{s.bpm} BPM</span>
                  </>
                }
                tags={s.builtin ? [{ label: 'Built-in' }] : undefined}
                onEdit={s.builtin ? undefined : () => setEditing({ song: s })}
                onDelete={s.builtin ? undefined : () => remove(s.id)}
              />
            ))}
          </ul>
        </div>

        {uploadError && <p className="modal__err">{uploadError}</p>}

        <div className="modal__footer">
          <button
            className="btn btn--ghost"
            style={{ marginRight: 'auto' }}
            onClick={() => setEditing('new')}
          >
            ＋ New song
          </button>
          <UploadButton
            className="btn btn--ghost"
            onData={handleUpload}
            onError={setUploadError}
          >
            ↑ Upload
          </UploadButton>
          <button className="btn btn--primary" onClick={onClose}>
            Done
          </button>
        </div>
      </Modal>

      {editing && (
        <SongEditor
          song={editing === 'new' ? null : editing.song}
          onSave={handleSave}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  )
}
