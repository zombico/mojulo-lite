/**
 * Simple markdown to HTML converter for legal documents
 * Handles: headers, tables, lists, bold, code, links, horizontal rules
 */
export function markdownToHtml(markdown) {
  let html = markdown;

  // Escape HTML entities first (except for our own tags)
  html = html
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Headers (must be at start of line)
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');

  // Bold and italic
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Links
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

  // Horizontal rules
  html = html.replace(/^---$/gm, '<hr />');

  // Tables
  html = convertTables(html);

  // Lists (unordered)
  html = convertLists(html);

  // Paragraphs - wrap remaining text blocks
  html = convertParagraphs(html);

  return html;
}

function convertTables(html) {
  const lines = html.split('\n');
  const result = [];
  let inTable = false;
  let tableRows = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const isTableRow = line.trim().startsWith('|') && line.trim().endsWith('|');
    const isSeparator = /^\|[-:\s|]+\|$/.test(line.trim());

    if (isTableRow && !isSeparator) {
      if (!inTable) {
        inTable = true;
        tableRows = [];
      }
      tableRows.push(line);
    } else if (isSeparator && inTable) {
      // Skip separator row
      continue;
    } else {
      if (inTable) {
        // End of table, convert it
        result.push(buildTable(tableRows));
        inTable = false;
        tableRows = [];
      }
      result.push(line);
    }
  }

  // Handle table at end of content
  if (inTable) {
    result.push(buildTable(tableRows));
  }

  return result.join('\n');
}

function buildTable(rows) {
  if (rows.length === 0) return '';

  let html = '<table>';

  rows.forEach((row, index) => {
    const cells = row
      .split('|')
      .slice(1, -1)
      .map((cell) => cell.trim());

    if (index === 0) {
      html += '<thead><tr>';
      cells.forEach((cell) => {
        html += `<th>${cell}</th>`;
      });
      html += '</tr></thead><tbody>';
    } else {
      html += '<tr>';
      cells.forEach((cell) => {
        html += `<td>${cell}</td>`;
      });
      html += '</tr>';
    }
  });

  html += '</tbody></table>';
  return html;
}

function convertLists(html) {
  const lines = html.split('\n');
  const result = [];
  let inList = false;

  for (const line of lines) {
    const listMatch = line.match(/^[-*]\s+(.+)$/);
    const numberedMatch = line.match(/^\d+\.\s+(.+)$/);

    if (listMatch) {
      if (!inList) {
        result.push('<ul>');
        inList = 'ul';
      }
      result.push(`<li>${listMatch[1]}</li>`);
    } else if (numberedMatch) {
      if (!inList) {
        result.push('<ol>');
        inList = 'ol';
      }
      result.push(`<li>${numberedMatch[1]}</li>`);
    } else {
      if (inList) {
        result.push(inList === 'ul' ? '</ul>' : '</ol>');
        inList = false;
      }
      result.push(line);
    }
  }

  if (inList) {
    result.push(inList === 'ul' ? '</ul>' : '</ol>');
  }

  return result.join('\n');
}

function convertParagraphs(html) {
  const lines = html.split('\n');
  const result = [];
  let paragraph = [];

  const isBlockElement = (line) => {
    const trimmed = line.trim();
    return (
      trimmed === '' ||
      trimmed.startsWith('<h') ||
      trimmed.startsWith('<table') ||
      trimmed.startsWith('<ul') ||
      trimmed.startsWith('<ol') ||
      trimmed.startsWith('<li') ||
      trimmed.startsWith('</') ||
      trimmed.startsWith('<hr') ||
      trimmed === '</ul>' ||
      trimmed === '</ol>' ||
      trimmed === '</table>' ||
      trimmed === '</thead>' ||
      trimmed === '</tbody>' ||
      trimmed === '<tbody>' ||
      trimmed.startsWith('<tr') ||
      trimmed.startsWith('<th') ||
      trimmed.startsWith('<td')
    );
  };

  for (const line of lines) {
    if (isBlockElement(line)) {
      if (paragraph.length > 0) {
        result.push(`<p>${paragraph.join(' ')}</p>`);
        paragraph = [];
      }
      if (line.trim() !== '') {
        result.push(line);
      }
    } else {
      paragraph.push(line);
    }
  }

  if (paragraph.length > 0) {
    result.push(`<p>${paragraph.join(' ')}</p>`);
  }

  return result.join('\n');
}
