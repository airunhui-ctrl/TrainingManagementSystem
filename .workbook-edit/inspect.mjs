import { FileBlob, SpreadsheetFile } from '@oai/artifact-tool';
const path = 'D:/Projects/TrainingManagementSystem/Docs/FeatureList/培训管理系统功能清单.xlsx';
const input = await FileBlob.load(path);
const wb = await SpreadsheetFile.importXlsx(input);
console.log((await wb.inspect({ kind: 'workbook,sheet,table', maxChars: 8000, tableMaxRows: 8, tableMaxCols: 12 })).ndjson);
console.log((await wb.inspect({ kind: 'match', searchTerm: 'WEB-DATA|WEB-STU', options: { useRegex: true, maxResults: 200 }, maxChars: 20000 })).ndjson);
