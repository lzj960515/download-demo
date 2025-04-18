import { Injectable } from '@nestjs/common';
import * as path from 'path';
import * as fs from 'fs';
import axios from 'axios';
import { Request, Response } from 'express';

@Injectable()
export class FileService {
  // 这里可以根据实际情况替换为真实的大文件
  getFilePath(): string {
    // 创建一个示例文件用于演示
    const filePath = path.join(process.cwd(), 'temp', 'large-file.bin');

    // 确保目录存在
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // 如果文件不存在，创建一个大文件用于测试
    if (!fs.existsSync(filePath)) {
      this.createLargeFile(filePath, 10 * 1024 * 1024); // 创建10MB的文件
    }

    return filePath;
  }

  private createLargeFile(filePath: string, sizeInBytes: number): void {
    const fd = fs.openSync(filePath, 'w');
    const bufferSize = 1024 * 1024; // 1MB
    const buffer = Buffer.alloc(bufferSize, 'x');

    let bytesWritten = 0;
    while (bytesWritten < sizeInBytes) {
      const toWrite = Math.min(bufferSize, sizeInBytes - bytesWritten);
      fs.writeSync(fd, buffer, 0, toWrite);
      bytesWritten += toWrite;
    }

    fs.closeSync(fd);
  }

  // 处理远程文件下载
  async downloadRemoteFile(
    fileUrl: string,
    req: Request,
    res: Response,
  ): Promise<void> {
    try {
      // 解析文件名
      const parsedUrl = new URL(fileUrl);
      const fileName = path.basename(parsedUrl.pathname) || 'downloaded-file';

      // 获取请求范围（支持断点续传）
      const range = req.headers.range;

      try {
        // 首先发送HEAD请求获取文件大小
        const headResponse = await axios.head(fileUrl);
        const fileSize = parseInt(
          headResponse.headers['content-length'] || '0',
          10,
        );

        if (range && fileSize > 0) {
          // 解析Range头
          const parts = range.replace(/bytes=/, '').split('-');
          const start = parseInt(parts[0], 10);
          const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

          const chunkSize = end - start + 1;

          // 设置响应头
          res.writeHead(206, {
            'Content-Range': `bytes ${start}-${end}/${fileSize}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': chunkSize,
            'Content-Type': 'application/octet-stream',
            'Content-Disposition': `attachment; filename=${fileName}`,
          });

          // 从远程下载指定范围的数据
          const response = await axios({
            method: 'GET',
            url: fileUrl,
            responseType: 'stream',
            headers: {
              Range: `bytes=${start}-${end}`,
            },
          });

          // 将数据流传输给客户端
          response.data.pipe(res);
        } else {
          // 无Range头，下载整个文件
          if (fileSize > 0) {
            res.writeHead(200, {
              'Content-Length': fileSize,
              'Content-Type': 'application/octet-stream',
              'Content-Disposition': `attachment; filename=${fileName}`,
              'Accept-Ranges': 'bytes',
            });
          } else {
            // 如果无法获取大小，仍然设置其他响应头
            res.writeHead(200, {
              'Content-Type': 'application/octet-stream',
              'Content-Disposition': `attachment; filename=${fileName}`,
              'Accept-Ranges': 'bytes',
            });
          }

          // 下载整个文件并流式传输给客户端
          const response = await axios({
            method: 'GET',
            url: fileUrl,
            responseType: 'stream',
          });

          response.data.pipe(res);
        }
      } catch (headError) {
        console.error('获取文件头信息失败:', headError);

        // 无法获取文件大小，尝试直接下载整个文件
        res.writeHead(200, {
          'Content-Type': 'application/octet-stream',
          'Content-Disposition': `attachment; filename=${fileName}`,
          'Accept-Ranges': 'bytes',
        });

        const response = await axios({
          method: 'GET',
          url: fileUrl,
          responseType: 'stream',
        });

        response.data.pipe(res);
      }
    } catch (error) {
      console.error('下载远程文件时出错:', error);
      res.status(500).send('下载文件时发生错误');
    }
  }

  getDownloadPage(): string {
    return `
    <!DOCTYPE html>
    <html lang="zh-CN">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>文件断点续传演示</title>
        <style>
            body {
                font-family: Arial, sans-serif;
                max-width: 800px;
                margin: 0 auto;
                padding: 20px;
            }
            .progress-container {
                width: 100%;
                background-color: #f1f1f1;
                border-radius: 5px;
                margin: 20px 0;
            }
            .progress-bar {
                height: 30px;
                background-color: #4CAF50;
                border-radius: 5px;
                width: 0%;
                text-align: center;
                line-height: 30px;
                color: white;
            }
            button {
                padding: 10px 20px;
                background-color: #4CAF50;
                color: white;
                border: none;
                border-radius: 5px;
                cursor: pointer;
                margin-right: 10px;
            }
            button:hover {
                background-color: #45a049;
            }
            .info {
                margin: 20px 0;
            }
            .url-input {
                width: 100%;
                padding: 10px;
                margin: 10px 0;
                border: 1px solid #ddd;
                border-radius: 5px;
                box-sizing: border-box;
            }
        </style>
    </head>
    <body>
        <h1>文件断点续传演示</h1>
        <p>这个页面演示了浏览器断开连接后重新连接时的断点续传功能。</p>
        
        <div>
            <input type="text" id="fileUrl" class="url-input" placeholder="输入远程文件URL（例如：https://example.com/large-file.zip）" />
            <button id="downloadBtn">开始下载</button>
            <button id="pauseBtn">暂停</button>
            <button id="resumeBtn">继续</button>
        </div>
        
        <div class="progress-container">
            <div class="progress-bar" id="progressBar">0%</div>
        </div>
        
        <div class="info">
            <p>已下载: <span id="downloaded">0</span> MB</p>
            <p>总大小: <span id="total">0</span> MB</p>
            <p>状态: <span id="status">未开始</span></p>
        </div>
        
        <script>
            let xhr = null;
            let downloadedSize = 0;
            let totalSize = 0;
            let currentUrl = '';
            
            // 检查本地存储中是否有下载进度
            function checkStoredProgress() {
                const storedProgress = localStorage.getItem('downloadProgress');
                const storedUrl = localStorage.getItem('downloadUrl');
                if (storedProgress && storedUrl) {
                    downloadedSize = parseInt(storedProgress, 10);
                    currentUrl = storedUrl;
                    document.getElementById('fileUrl').value = currentUrl;
                    updateProgressUI();
                    document.getElementById('status').textContent = '可以继续下载';
                }
            }
            
            function updateProgressUI() {
                if (totalSize > 0) {
                    const percent = Math.round((downloadedSize / totalSize) * 100);
                    document.getElementById('progressBar').style.width = percent + '%';
                    document.getElementById('progressBar').textContent = percent + '%';
                }
                
                document.getElementById('downloaded').textContent = (downloadedSize / (1024 * 1024)).toFixed(2);
                document.getElementById('total').textContent = (totalSize / (1024 * 1024)).toFixed(2);
            }
            
            function startDownload() {
                const urlInput = document.getElementById('fileUrl');
                const url = urlInput.value.trim() || currentUrl;
                
                if (!url) {
                    document.getElementById('status').textContent = '请输入文件URL';
                    return;
                }
                
                currentUrl = url;
                localStorage.setItem('downloadUrl', currentUrl);
                
                if (xhr) {
                    xhr.abort();
                }
                
                xhr = new XMLHttpRequest();
                
                // 添加URL查询参数来下载远程文件
                xhr.open('GET', '/file/download?url=' + encodeURIComponent(url), true);
                
                // 设置Range头，支持断点续传
                if (downloadedSize > 0) {
                    xhr.setRequestHeader('Range', 'bytes=' + downloadedSize + '-');
                }
                
                xhr.responseType = 'blob';
                
                xhr.onprogress = function(event) {
                    if (event.lengthComputable) {
                        totalSize = downloadedSize + event.total;
                        const currentProgress = downloadedSize + event.loaded;
                        
                        // 保存下载进度到本地存储
                        localStorage.setItem('downloadProgress', currentProgress.toString());
                        
                        document.getElementById('downloaded').textContent = (currentProgress / (1024 * 1024)).toFixed(2);
                        document.getElementById('total').textContent = (totalSize / (1024 * 1024)).toFixed(2);
                        
                        const percent = Math.round((currentProgress / totalSize) * 100);
                        document.getElementById('progressBar').style.width = percent + '%';
                        document.getElementById('progressBar').textContent = percent + '%';
                    }
                };
                
                xhr.onload = function() {
                    if (xhr.status === 200 || xhr.status === 206) {
                        document.getElementById('status').textContent = '下载完成';
                        
                        // 下载完成后清除本地存储的进度
                        localStorage.removeItem('downloadProgress');
                        localStorage.removeItem('downloadUrl');
                        
                        // 创建文件下载链接
                        const blob = new Blob([xhr.response]);
                        const url = window.URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.style.display = 'none';
                        a.href = url;
                        
                        // 从URL中提取文件名
                        const urlObj = new URL(currentUrl);
                        const fileName = urlObj.pathname.split('/').pop() || 'downloaded-file';
                        a.download = fileName;
                        
                        document.body.appendChild(a);
                        a.click();
                        window.URL.revokeObjectURL(url);
                    }
                };
                
                xhr.onerror = function() {
                    document.getElementById('status').textContent = '下载出错';
                };
                
                xhr.onabort = function() {
                    document.getElementById('status').textContent = '下载已暂停';
                };
                
                xhr.send();
                document.getElementById('status').textContent = '下载中...';
            }
            
            document.getElementById('downloadBtn').addEventListener('click', function() {
                downloadedSize = 0;
                localStorage.removeItem('downloadProgress');
                startDownload();
            });
            
            document.getElementById('pauseBtn').addEventListener('click', function() {
                if (xhr) {
                    xhr.abort();
                    document.getElementById('status').textContent = '下载已暂停';
                }
            });
            
            document.getElementById('resumeBtn').addEventListener('click', function() {
                startDownload();
            });
            
            // 页面加载时检查下载进度
            window.onload = function() {
                checkStoredProgress();
                
                // 页面关闭前的处理
                window.addEventListener('beforeunload', function() {
                    if (xhr && xhr.readyState < 4 && xhr.readyState > 0) {
                        xhr.abort();
                    }
                });
            };
        </script>
    </body>
    </html>
    `;
  }
}
