package tcp

import (
	"net"
	"sync"
)

type ConnectionPool struct {
	mu    sync.RWMutex
	conns map[string]net.Conn
}

func NewConnectionPool() *ConnectionPool {
	return &ConnectionPool{
		conns: make(map[string]net.Conn),
	}
}

func (p *ConnectionPool) Add(imei string, conn net.Conn) {
	p.mu.Lock()
	defer p.mu.Unlock()
	if old, ok := p.conns[imei]; ok {
		old.Close()
	}
	p.conns[imei] = conn
}

func (p *ConnectionPool) Remove(imei string) {
	p.mu.Lock()
	defer p.mu.Unlock()
	delete(p.conns, imei)
}

func (p *ConnectionPool) Get(imei string) net.Conn {
	p.mu.RLock()
	defer p.mu.RUnlock()
	return p.conns[imei]
}
