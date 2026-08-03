import { FileBlob, SpreadsheetFile } from '@oai/artifact-tool';
const path = 'D:/Projects/TrainingManagementSystem/Docs/FeatureList/培训管理系统功能清单.xlsx';
const wb = await SpreadsheetFile.importXlsx(await FileBlob.load(path));
console.log((await wb.inspect({ kind: 'match', searchTerm: 'WEB-DATA-004', options: { useRegex: false, maxResults: 50 }, maxChars: 10000 })).ndjson);
