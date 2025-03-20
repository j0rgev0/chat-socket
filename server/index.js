import express from 'express'
import logger from 'morgan'
import dotenv from 'dotenv'
import { neon } from '@neondatabase/serverless'
import { Server } from 'socket.io'
import { createServer } from 'node:http'

dotenv.config()
const port = process.env.PORT ?? 3000

const app = express()
const server = createServer(app)
const io = new Server(server, {
  connectionStateRecovery: {}
})

const sql = neon(process.env.DATABASE_URL)

async function createTable () {
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS messages (
        id SERIAL PRIMARY KEY,
        content TEXT NOT NULL,
        username TEXT NOT NULL
      )
    `
    console.log('✅ Tabla messages verificada/creada correctamente.')
  } catch (error) {
    console.error('❌ Error creando la tabla:', error)
  }
}

async function saveMessage (content, username) {
  if (!content) {
    console.error('❌ Error: Intento de guardar un mensaje vacío.')
    return null
  }

  try {
    const result = await sql`
      INSERT INTO messages (content, username) VALUES (${content}, ${username}) RETURNING id, content, username
    `
    console.log('✅ Mensaje insertado:', result[0])
    return result[0] ?? null
  } catch (error) {
    console.error('❌ Error insertando mensaje:', error)
    return null
  }
}

async function getMessages () {
  try {
    const result = await sql`
      SELECT id, content, username FROM messages ORDER BY id ASC
    `
    console.log(`📩 Mensajes obtenidos (${result.length}):`, result)
    return result
  } catch (error) {
    console.error('❌ Error obteniendo mensajes:', error)
    return []
  }
}

createTable()

io.on('connection', async (socket) => {
  console.log('🔗 Un usuario se ha conectado!')
  console.log('🤝 Auth:', socket.handshake.auth)

  if (!socket.recovered) {
    try {
      const messages = await getMessages()
      socket.emit('chat history', messages)

      messages.forEach(({ id, content, username }) => {
        socket.emit('chat message', content, id.toString(), username)
      })
    } catch (error) {
      console.error('❌ Error enviando historial de mensajes:', error)
    }
  }

  socket.on('disconnect', () => {
    console.log('🔌 Un usuario se ha desconectado!')
  })

  socket.on('chat message', async (msg) => {
    const username = socket.handshake.auth.username ?? 'anonymous'
    try {
      const savedMessage = await saveMessage(msg, username)
      if (savedMessage) {
        io.emit('chat message', savedMessage.content, savedMessage.id.toString(), savedMessage.username)
      }
    } catch (error) {
      console.error('❌ Error en chat message:', error)
    }
  })
})

app.use(logger('dev'))

app.get('/', (req, res) => {
  res.sendFile(process.cwd() + '/client/index.html')
})

server.listen(port, () => {
  console.log(`🚀 Servidor corriendo en http://localhost:${port}`)
})
