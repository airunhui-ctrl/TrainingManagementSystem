import { FileBlob, SpreadsheetFile } from '@oai/artifact-tool';
const path = 'D:/Projects/TrainingManagementSystem/Docs/FeatureList/培训管理系统功能清单.xlsx';
const wb = await SpreadsheetFile.importXlsx(await FileBlob.load(path));
console.log((await wb.inspect({ kind: 'match', searchTerm: 'MP-ENR-007|MP-ME-007', options: { useRegex: true, maxResults: 100 }, maxChars: 30000 })).ndjson);
