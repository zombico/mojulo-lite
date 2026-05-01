'use client';

export default function ArrayField({
  items,
  onAdd,
  onUpdate,
  onRemove,
  itemLabel = 'Item',
  placeholder = 'Enter value',
  maxItems = 10
}) {
  return (
    <div className="space-y-3">
      {items.map((item, index) => (
        <div key={index} className="p-4 border border-gray-700 rounded-lg ">
          <div className="flex justify-between items-start mb-3">
            <span className="text-sm font-medium text-gray-400">
              {itemLabel} #{index + 1}
            </span>
            <button
              type="button"
              onClick={() => onRemove(index)}
              className="text-red-400 hover:text-red-300 text-sm font-medium transition"
            >
              Remove
            </button>
          </div>
          <input
            type="text"
            value={item.suggestedPrompt || ''}
            onChange={(e) => onUpdate(index, e.target.value)}
            placeholder={placeholder}
            className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-teal-500"
          />
        </div>
      ))}

      {items.length < maxItems && (
        <button
          type="button"
          onClick={onAdd}
          className="w-full px-4 py-3 border-2 border-dashed border-gray-600 rounded-lg text-gray-400 hover:border-gray-500 hover:text-gray-300 transition flex items-center justify-center gap-2"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add {itemLabel}
        </button>
      )}
    </div>
  );
}
