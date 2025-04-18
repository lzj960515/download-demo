import { Controller, Get, Res, Req, Header, Query } from '@nestjs/common';
import { Request, Response } from 'express';
import { FileService } from './file.service';
import * as fs from 'fs';
import * as path from 'path';

@Controller('file')
export class FileController {
  constructor(private readonly fileService: FileService) {}

  @Get('download')
  async downloadFile(
    @Req() req: Request,
    @Res() res: Response,
    @Query('url') url?: string,
  ) {
    if (url) {
      // 如果提供了URL，使用远程文件
      return await this.fileService.downloadRemoteFile(url, req, res);
    }

    // 原有的本地文件下载逻辑
    // 示例文件路径（这里使用一个大文件示例）
    const filePath = this.fileService.getFilePath();
    const fileName = path.basename(filePath);

    // 获取文件状态
    const stat = fs.statSync(filePath);
    const fileSize = stat.size;

    // 获取请求范围（支持断点续传）
    const range = req.headers.range;

    if (range) {
      // 解析Range头
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

      const chunkSize = end - start + 1;
      const fileStream = fs.createReadStream(filePath, { start, end });

      // 设置响应头
      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunkSize,
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename=${fileName}`,
      });

      // 发送数据
      fileStream.pipe(res);
    } else {
      // 无Range头，发送整个文件
      res.writeHead(200, {
        'Content-Length': fileSize,
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename=${fileName}`,
        'Accept-Ranges': 'bytes',
      });

      const fileStream = fs.createReadStream(filePath);
      fileStream.pipe(res);
    }
  }

  @Get('download-page')
  @Header('Content-Type', 'text/html')
  getDownloadPage() {
    return this.fileService.getDownloadPage();
  }
}
