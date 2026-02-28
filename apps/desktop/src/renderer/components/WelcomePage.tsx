/**
 * Welcome Page Component - Default view when no document is open
 */
import { DocumentIcon, FolderOpenIcon, PlusIcon, SparklesIcon } from './icons';

interface WelcomePageProps {
  onNewDocument: () => void;
  onOpenDocument: () => void;
}

export function WelcomePage({ onNewDocument, onOpenDocument }: WelcomePageProps) {
  return (
    <div className="flex-1 h-full bg-white flex flex-col items-center justify-center p-8">
      <div className="max-w-2xl w-full text-center">
        {/* Logo/Icon */}
        <div className="mb-8">
          <div className="w-20 h-20 mx-auto bg-gradient-to-br from-blue-500 to-purple-600 rounded-2xl flex items-center justify-center shadow-lg">
            <DocumentIcon className="w-10 h-10 text-white" />
          </div>
        </div>

        {/* Title */}
        <h1 className="text-4xl font-bold text-gray-900 mb-4">
          Welcome to MarkdownX
        </h1>

        {/* Description */}
        <p className="text-lg text-gray-600 mb-2">
          Local-first, AI-ready note taking
        </p>
        <p className="text-sm text-gray-500 mb-10">
          Your notes stay on your device. Always available, even offline.
        </p>

        {/* Action cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-10">
          <button
            onClick={onNewDocument}
            className="group p-6 bg-gray-50 hover:bg-blue-50 border border-gray-200 hover:border-blue-200 rounded-xl transition-all text-left"
          >
            <div className="w-12 h-12 bg-blue-100 group-hover:bg-blue-200 rounded-lg flex items-center justify-center mb-4 transition-colors">
              <PlusIcon className="w-6 h-6 text-blue-600" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              Create New Document
            </h3>
            <p className="text-sm text-gray-500">
              Start fresh with a new MarkdownX document
            </p>
            <kbd className="mt-3 inline-block px-2 py-1 text-xs bg-white border border-gray-200 rounded text-gray-500">
              Cmd+N
            </kbd>
          </button>

          <button
            onClick={onOpenDocument}
            className="group p-6 bg-gray-50 hover:bg-green-50 border border-gray-200 hover:border-green-200 rounded-xl transition-all text-left"
          >
            <div className="w-12 h-12 bg-green-100 group-hover:bg-green-200 rounded-lg flex items-center justify-center mb-4 transition-colors">
              <FolderOpenIcon className="w-6 h-6 text-green-600" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              Open Document
            </h3>
            <p className="text-sm text-gray-500">
              Browse and open existing MarkdownX files
            </p>
            <kbd className="mt-3 inline-block px-2 py-1 text-xs bg-white border border-gray-200 rounded text-gray-500">
              Cmd+O
            </kbd>
          </button>
        </div>

        {/* Features */}
        <div className="flex flex-wrap justify-center gap-6 text-sm text-gray-500">
          <div className="flex items-center gap-2">
            <SparklesIcon className="w-4 h-4 text-purple-500" />
            <span>AI-Ready Architecture</span>
          </div>
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <span>Local-First Storage</span>
          </div>
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            <span>Auto-Sync (CRDT)</span>
          </div>
        </div>
      </div>
    </div>
  );
}
