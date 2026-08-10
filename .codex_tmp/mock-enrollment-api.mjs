import http from 'node:http'

let failEnrollment = true
const json = (response, status, body) => {
  const payload = JSON.stringify(body)
  response.writeHead(status, {
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'content-type, authorization',
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    'content-type': 'application/json',
    'content-length': Buffer.byteLength(payload),
  })
  response.end(payload)
}

const server = http.createServer((request, response) => {
  const url = new URL(request.url || '/', 'http://127.0.0.1:3199')
  if (request.method === 'OPTIONS') return json(response, 204, {})
  if (url.pathname === '/toggle') {
    failEnrollment = url.searchParams.get('fail') !== '0'
    return json(response, 200, { failEnrollment })
  }
  if (request.method === 'POST' && url.pathname === '/api/auth/login') {
    return json(response, 200, { accessToken: 'mock-access-token', refreshToken: 'mock-refresh-token', user: { username: 'admin', role: 'admin' } })
  }
  if (url.pathname === '/api/admin/dashboard') return json(response, 200, {})
  if (url.pathname === '/api/admin/courses') return json(response, 200, { items: [{ id: 'course-mock', title: '模拟课程' }], total: 1, page: 1, pageSize: 100 })
  if (url.pathname === '/api/admin/enrollment-records') {
    if (failEnrollment) return json(response, 503, { message: '模拟报名明细接口暂时不可用' })
    return json(response, 200, { items: [{ id: 'enr-mock', name: '模拟学员', phone: '138****0000', courseTitle: '模拟课程', status: 'registered', orderStatus: '待支付' }], total: 1, page: 1, pageSize: 5 })
  }
  return json(response, 200, { items: [], total: 0, page: 1, pageSize: 5 })
})

server.listen(3199, '127.0.0.1', () => console.log('mock enrollment api listening on 3199'))
