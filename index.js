require("dotenv").config();
const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const jwt = require("jsonwebtoken");
const morgan = require("morgan");

const port = process.env.PORT || 9000;
const app = express();
// middleware
const corsOptions = {
  origin: ["http://localhost:5173", "http://localhost:5174"],
  credentials: true,
  optionSuccessStatus: 200,
};
app.use(cors(corsOptions));

app.use(express.json());
app.use(cookieParser());
app.use(morgan("dev"));

const verifyToken = async (req, res, next) => {
  const token = req.cookies?.token;

  if (!token) {
    return res.status(401).send({ message: "unauthorized access" });
  }
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) {
      console.log(err);
      return res.status(401).send({ message: "unauthorized access" });
    }
    req.user = decoded;
    next();
  });
};

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.cjt8m.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});
async function run() {
  try {
    const db = client.db("PlantNet");
    const usersCollection = db.collection("users");
    const plantsCollection = db.collection("plants");
    const ordersCollection = db.collection("orders");

    // Save or update user info in Database
    app.post("/users/:email", async (req, res) => {
      const email = req.params.email;
      const query = { email };
      const user = req.body;

      // Check user is All-ready exist or not
      const isExist = await usersCollection.findOne(query);
      if (isExist) {
        return res.send(isExist);
      }
      const result = await usersCollection.insertOne({
        ...user,
        role: "customer",
        timeStamp: Date.now(),
      });
      res.send(result);
    });

    // ----------------------------------------Generate jwt token---------------------------------------------
    app.post("/jwt", async (req, res) => {
      const email = req.body;
      const token = jwt.sign(email, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: "365d",
      });
      res
        .cookie("token", token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
        })
        .send({ success: true });
    });
    // Logout
    app.get("/logout", async (req, res) => {
      try {
        res
          .clearCookie("token", {
            maxAge: 0,
            secure: process.env.NODE_ENV === "production",
            sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
          })
          .send({ success: true });
      } catch (err) {
        res.status(500).send(err);
      }
    });
    //----------------------------------------------JWT--------------------------------------------------------

    // ------------------------------------------Plants Collection------------------------------------------------

    // Plants Add (Post method)
    app.post("/plants", verifyToken, async (req, res) => {
      const plant = req.body;
      const result = await plantsCollection.insertOne(plant);
      res.send(result);
    });

    // Plants get (GET Method)
    app.get("/plants", async (req, res) => {
      const result = await plantsCollection.find().toArray();
      res.send(result);
    });

    // plants get by id
    app.get("/plants/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await plantsCollection.findOne(query);
      res.send(result);
    });

    // save order in db
    app.post("/order", verifyToken, async (req, res) => {
      const orderInfo = req.body;
      const result = await ordersCollection.insertOne(orderInfo);
      res.send(result);
    });

    // Manage plant/order quantity
    app.patch("/plants/quantity/:id", verifyToken, async (req, res) => {
      const id = req.params.id;
      const { quantityToUpdate } = req.body;
      const filter = { _id: new ObjectId(id) };
      let updateDoc = {
        // inc use kora hoi value increase korar jonno
        $inc: { quantity: -quantityToUpdate },
      };
      const result = await plantsCollection.updateOne(filter, updateDoc);
      res.send(result);
    });

    // get all order for a specific customer by email
    app.get("/customer-orders/:email", async (req, res) => {
      const email = req.params.email;
      const query = { "customer.email": email };

      // Aggreged korte hbe ---> part-3 (32:22 min)
      const result = await ordersCollection
        .aggregate([
          // 1st state match -->
          {
            $match: query, //match specific customers data only by email
          },
          {
            $addFields: {
              plantId: { $toObjectId: "$plantID" }, //convert plantID to objectId field
            },
          },
          {
            $lookup: {
              // go to a different collection and look for data
              from: "plants", // collection name
              localField: "plantId", // local data that i want to match
              foreignField: "_id", // foreign field name of that same data
              as: "plants", // return the data as plants array (array naming)
            },
          },
          {
            $unwind: "$plants", // unwind lookup result, return without array
          },
          {
            $addFields: {
              // add those fields in order object
              name: "$plants.name",
              image: "$plants.image",
              category: "$plants.category",
            },
          },
          {
            $project: {
              // remove plants object property from order object
              plants: 0,
            },
          },
        ])
        .toArray();
      res.send(result);
    });

    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Hello from plantNet Server..");
});

app.listen(port, () => {
  console.log(`plantNet is running on port ${port}`);
});
