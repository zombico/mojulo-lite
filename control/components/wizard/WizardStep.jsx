'use client';

export default function WizardStep({
  stepNumber,
  title,
  description,
  children
}) {
  return (
     <div className="space-y-6">
      {/* Step Header */}
      <div className="border-b border-gray-200 pb-4">
        <div className="flex items-center gap-2 mb-2">
          <div className="flex items-center justify-center w-6 h-6 rounded-full bg-blue-600 text-white font-semibold text-sm">
            {stepNumber}
          </div>
          <h2 className="text-md font-bold text-gray-900">{title}</h2>
        </div>
        {description && (
          <p className="text-gray-500 text-sm px-8">{description}</p>
        )}
      </div>

      {/* Step Content */}
      
      {children}
    </div>
  );
}



  