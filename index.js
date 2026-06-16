const dns = require('node:dns');
dns.setServers(['1.1.1.1', '1.0.0.1']);

const express = require("express");
const dontenv = require("dotenv");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const { createRemoteJWKSet, jwtVerify } = require('jose-cjs');
const { title } = require('node:process');
dontenv.config();

const uri = process.env.MONGODB_URI;

const app = express();
const PORT = process.env.PORT;

app.use(
  cors({
    credentials: true,
    origin: [process.env.CLIENT_URL],
  }),
);
app.use(express.json());

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

const JWKS = createRemoteJWKSet(new URL(`${process.env.CLIENT_URL}/api/auth/jwks`))

const verifyToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  // console.log(authHeader)
  if (!authHeader) {
    return res.status(401).json({ message: 'Unauthorized' })
  }
  const token = authHeader.split(' ')[1]
  // console.log(token)
  if (!token) {
    return res.status(401).json({ message: 'Unauthorized' })
  }
  try {
    const { payload } = await jwtVerify(token, JWKS)
    req.user = payload;
    // console.log(payload)
    next()
  } catch (error) {
    console.log(error)
    return res.status(401).json({ message: 'Unauthorized' })
  }
}
const sellerVerify = async (req, res, next) => {
  const user = req.user;
  // console.log('seller verify',user)
  if (user.role !== 'seller' || user.plan !== 'pro') {
    return res.status(403).json({ msg: forbidden })
  }
  next()
}

async function run() {
  try {
    await client.connect();
    const db = client.db("tech-bazaar");
    const subscriptionCollection = db.collection('subscription')
    const userCollection = db.collection('user')
    const productsCollection = db.collection('products')
    const paymentCollection=db.collection('payments')


    app.post('/subscription', async (req, res) => {
      const { sessionId, userId, priceId } = req.body;
      const isExist = await subscriptionCollection.findOne({ sessionId })
      if (isExist) {
        return res.json({ msg: 'already Exist!' })
      }
      await subscriptionCollection.insertOne(
        {
          sessionId,
          priceId,
          userId,
          paidAt: new Date()
        }
      )
      await userCollection.updateOne(
        { _id: new ObjectId(userId) },
        {
          $set: {
            plan: 'pro'
          }
        }
      );
      res.json({ message: 'payments Successful' })
    })

    //.......products........

    app.get('/seller/products', verifyToken, sellerVerify, async (req, res) => {
      const { page = 1, limit = 6 } = req.query;
      const skip = (Number(page - 1)) * Number(limit)
      const result = await productsCollection.find({ userId: req.user.id }).skip(skip).limit(Number(limit)).toArray()
      const totalData = await productsCollection.countDocuments({ userId: req.user.id })
      const totalPage = Math.ceil(totalData / Number(limit))
      res.json({ data: result, page: Number(page), totalPage })
    })

    app.post('/seller/products', verifyToken, sellerVerify, async (req, res) => {
      const data = req.body;
      const result = await productsCollection.insertOne({ ...data, userId: req.user.id })
      res.send(result)
    })

    app.get('/products', async (req, res) => {
      const { search } = req.query;
      const query = {}
      if (search && search !== 'undefined' && search.trim() !== '') {
        query.$or = [
          { title: { $regex: search, $options: 'i' } },
          { description: { $regex: search, $options: 'i' } }
        ]
      }

      const result = await productsCollection.find(query).toArray()
      res.json(result)
      // console.log(result)
    })

    app.get('/products/:id',async(req,res)=>{
      const {id}=req.params;
      const result=await productsCollection.findOne({_id:new ObjectId(id)})
      res.json(result)
    })

    //.......payments.........

    
    app.post('/payments', async (req, res) => {
      const {userEmail, sessionId, userId, priceId } = req.body;
      const isExist = await paymentCollection.findOne({ sessionId })
      if (isExist) {
        return res.json({ msg: 'already Exist!' })
      }
      const result=await paymentCollection.insertOne(
        {
          sessionId,
          priceId,
          userId,
          userEmail,
          paidAt: new Date()
        }
      )
      res.json(result)
    })





    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!",
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Server is running fine!");
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
