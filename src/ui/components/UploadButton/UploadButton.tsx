import { useRef } from 'react'
import type { ReactNode } from 'react'
import { jsonErrorText } from '../../../utils'

// A button that opens a file picker, reads the chosen file as JSON, and hands
// the parsed value to `onData`. Parse *and* import errors (anything `onData`
// throws) are turned into a friendly message via `onError`, so the caller can
// display it wherever it likes. The hidden <input> is reset after each pick so
// choosing the same file twice still fires.
interface UploadButtonProps {
  onData: (data: unknown) => void | Promise<void>
  onError?: (message: string) => void
  className?: string
  accept?: string
  children: ReactNode
}

export default function UploadButton({
  onData,
  onError,
  className,
  accept = 'application/json,.json',
  children,
}: UploadButtonProps) {
  const fileRef = useRef<HTMLInputElement>(null)

  const handleFile = async (file: File | undefined) => {
    onError?.('')
    if (!file) return
    try {
      await onData(JSON.parse(await file.text()))
    } catch (err) {
      onError?.(jsonErrorText(err))
    }
  }

  return (
    <>
      <button
        type="button"
        className={className}
        onClick={() => fileRef.current?.click()}
      >
        {children}
      </button>
      <input
        ref={fileRef}
        type="file"
        accept={accept}
        hidden
        onChange={(e) => {
          handleFile(e.target.files?.[0])
          e.target.value = ''
        }}
      />
    </>
  )
}
