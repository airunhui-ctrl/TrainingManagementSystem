import fs from 'node:fs/promises';
import { FileBlob, SpreadsheetFile } from '@oai/artifact-tool';
const input = await FileBlob.load('D:/Projects/TrainingManagementSystem/Docs/FeatureList/培训管理系统功能清单.xlsx');
const wb = await SpreadsheetFile.importXlsx(input);
const out = await wb.render({ sheetName: '标准功能清单', range: 'A96:N109', scale: 1.2, format: 'png' });
await fs.writeFile('before-standard.png', new Uint8Array(await out.arrayBuffer()));
const out2 = await wb.render({ sheetName: '详细原子功能', range: 'A384:O406', scale: 1.2, format: 'png' });
await fs.writeFile('before-atomic.png', new Uint8Array(await out2.arrayBuffer()));
