import { FileBlob, SpreadsheetFile } from '@oai/artifact-tool';
const input = await FileBlob.load('D:/Projects/TrainingManagementSystem/Docs/FeatureList/培训管理系统功能清单.xlsx');
const wb = await SpreadsheetFile.importXlsx(input);
for (const [sheetName, range] of [['标准功能清单','A98:N109'],['详细原子功能','A380:O406']]) {
 const s=wb.worksheets.getItem(sheetName); console.log(`---${sheetName}---`); console.log(JSON.stringify(s.getRange(range).values));
}
